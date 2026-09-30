-- Keep the established question snapshot/scoring RPCs. Add real room settings,
-- an authenticated, privacy-filtered directory, and server-side leaving.
begin;

alter table public.live_rooms add column if not exists visibility text not null default 'private';
alter table public.live_rooms add column if not exists max_players integer not null default 4;
alter table public.live_rooms drop constraint if exists live_rooms_visibility_check;
alter table public.live_rooms add constraint live_rooms_visibility_check check (visibility in ('public', 'private'));
alter table public.live_rooms drop constraint if exists live_rooms_max_players_check;
alter table public.live_rooms add constraint live_rooms_max_players_check check (max_players in (2, 4, 6));
create index if not exists live_rooms_directory_idx on public.live_rooms (visibility, status, created_at desc)
  where status in ('lobby', 'active');

create or replace function public.create_live_room_configured(
  p_pack_id uuid, p_artifact_id uuid default null,
  p_visibility text default 'private', p_max_players integer default 4
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_visibility is null or p_visibility not in ('public', 'private')
    or p_max_players is null or p_max_players not in (2, 4, 6) then
    raise exception 'Choose a valid room privacy and player limit' using errcode = '22023';
  end if;
  -- Canonical creation checks ownership and quiz eligibility, creates host membership,
  -- and privately snapshots answer keys in the same database transaction.
  v_result := public.create_live_room(p_pack_id, p_artifact_id);
  update public.live_rooms set visibility = p_visibility, max_players = p_max_players
  where id = (v_result->>'roomId')::uuid and host_id = v_uid;
  return v_result || jsonb_build_object('visibility', p_visibility, 'maxPlayers', p_max_players);
end;
$$;
revoke all on function public.create_live_room_configured(uuid, uuid, text, integer) from public, anon;
grant execute on function public.create_live_room_configured(uuid, uuid, text, integer) to authenticated, service_role;

create or replace function public.join_live_room(p_join_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.live_rooms%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Serialize joins and leaves so simultaneous requests cannot exceed the limit.
  select * into v_room from public.live_rooms where join_code = upper(trim(p_join_code)) for update;
  if not found then raise exception 'Room not found with that code' using errcode = '22023'; end if;
  if v_room.expires_at <= now() or v_room.status = 'complete' then
    raise exception 'This room has ended or expired' using errcode = '22023';
  end if;
  if exists (select 1 from public.live_room_members where room_id = v_room.id and user_id = v_uid) then
    return jsonb_build_object('roomId', v_room.id, 'status', v_room.status, 'packId', v_room.pack_id);
  end if;
  if v_room.status <> 'lobby' then raise exception 'This session has already started' using errcode = '22023'; end if;
  if (select count(*) from public.live_room_members where room_id = v_room.id) >= v_room.max_players then
    raise exception 'This room is full' using errcode = '22023';
  end if;
  -- The secret six-character code is the invitation for a private room.
  insert into public.live_room_members (room_id, user_id, score) values (v_room.id, v_uid, 0);
  return jsonb_build_object('roomId', v_room.id, 'status', v_room.status, 'packId', v_room.pack_id);
end;
$$;
revoke all on function public.join_live_room(text) from public, anon;
grant execute on function public.join_live_room(text) to authenticated, service_role;

create or replace function public.join_public_live_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select join_code into v_code from public.live_rooms where id = p_room_id and visibility = 'public';
  if not found then raise exception 'Public room not found' using errcode = '42501'; end if;
  return public.join_live_room(v_code);
end;
$$;
revoke all on function public.join_public_live_room(uuid) from public, anon;
grant execute on function public.join_public_live_room(uuid) to authenticated, service_role;

create or replace function public.leave_live_room(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_room public.live_rooms%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_room from public.live_rooms where id = p_room_id for update;
  if not found or not exists (select 1 from public.live_room_members where room_id = p_room_id and user_id = v_uid) then
    raise exception 'Access denied: not a member of this room' using errcode = '42501';
  end if;
  -- Completed results remain intact; leaving a live lobby removes actual membership.
  if v_room.status <> 'complete' then
    if v_room.host_id = v_uid then
      update public.live_rooms set status = 'complete', completed_at = now(), version = version + 1 where id = p_room_id;
    else
      delete from public.live_room_members where room_id = p_room_id and user_id = v_uid;
      update public.live_rooms set version = version + 1 where id = p_room_id;
    end if;
  end if;
  return jsonb_build_object('left', true, 'roomId', p_room_id);
end;
$$;
revoke all on function public.leave_live_room(uuid) from public, anon;
grant execute on function public.leave_live_room(uuid) to authenticated, service_role;

create or replace function public.get_live_home(p_period text default 'week')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_since timestamptz;
  v_rooms jsonb;
  v_leaderboard jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_period is null or p_period not in ('today', 'week', 'all') then
    raise exception 'Invalid leaderboard period' using errcode = '22023';
  end if;
  v_since := case p_period when 'today' then date_trunc('day', now()) when 'week' then now() - interval '7 days' else '-infinity'::timestamptz end;

  select coalesce(jsonb_agg(to_jsonb(room) order by room."createdAt" desc), '[]'::jsonb) into v_rooms
  from (
    select r.id as "roomId", p.title as "packTitle", r.status, r.visibility,
      r.max_players as "maxPlayers", r.created_at as "createdAt",
      (select count(*) from public.live_room_members m where m.room_id = r.id) as "playerCount",
      exists(select 1 from public.live_room_members m where m.room_id = r.id and m.user_id = v_uid) as "isMember"
    from public.live_rooms r join public.study_packs p on p.id = r.pack_id
    where r.status in ('lobby', 'active') and r.expires_at > now()
      and (r.visibility = 'public' or exists(select 1 from public.live_room_members m where m.room_id = r.id and m.user_id = v_uid))
    order by r.created_at desc limit 20
  ) room;

  -- Publish only scores from completed PUBLIC sessions. Private competition results
  -- stay in their room. Names/avatars are the same limited profile projection as the lobby.
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.score desc, entry."displayName"), '[]'::jsonb) into v_leaderboard
  from (
    select p.id as "userId", coalesce(p.display_name, 'Study Buddy') as "displayName", p.username,
      p.avatar_url as "avatarUrl", scores.score, scores."roomsPlayed", scores.accuracy
    from (
      select a.user_id, sum(a.points_awarded)::integer as score,
        count(distinct a.room_id)::integer as "roomsPlayed", round(100 * avg(a.is_correct::integer))::integer as accuracy
      from public.live_room_answers a join public.live_rooms r on r.id = a.room_id
      where r.status = 'complete' and r.visibility = 'public' and r.completed_at >= v_since
      group by a.user_id
    ) scores join public.profiles p on p.id = scores.user_id
    order by scores.score desc, p.display_name limit 5
  ) entry;

  return jsonb_build_object('rooms', v_rooms, 'leaderboard', v_leaderboard);
end;
$$;
revoke all on function public.get_live_home(text) from public, anon;
grant execute on function public.get_live_home(text) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
