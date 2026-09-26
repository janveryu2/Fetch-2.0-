-- Migration: 20260926060000_friend_profiles_and_live.sql
-- Phase 7: Friend profiles with privacy switches, handle backfill, DM enforcement, and Live quiz artifact support.

-- 1. Add optional education/program/subject fields and visibility switches to public.profiles
alter table public.profiles add column if not exists education_level text default null;
alter table public.profiles add column if not exists major_or_program text default null;
alter table public.profiles add column if not exists primary_subject text default null;
alter table public.profiles add column if not exists show_education boolean not null default false;
alter table public.profiles add column if not exists show_program boolean not null default false;
alter table public.profiles add column if not exists show_subject boolean not null default false;

-- 2. Backfill null usernames with non-email-derived unique handles
update public.profiles
set username = 'learner_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10)
where username is null or username = '';

-- Ensure default handle generation for future profiles if username is null
create or replace function public.handle_profile_default_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is null or new.username = '' then
    new.username := 'learner_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_default_username on public.profiles;
create trigger trg_profile_default_username
before insert or update on public.profiles
for each row
execute function public.handle_profile_default_username();

-- 3. Friend-scoped projection RPC: get_friend_profile
create or replace function public.get_friend_profile(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_clean_username text;
  v_target public.profiles%rowtype;
  v_is_self boolean := false;
  v_is_friend boolean := false;
  v_friendship_status text := 'none';
  v_dm_allowed boolean := true;
  v_can_message boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_clean_username := lower(trim(p_username));
  if v_clean_username like '@%' then
    v_clean_username := substr(v_clean_username, 2);
  end if;

  select * into v_target
  from public.profiles
  where lower(username) = v_clean_username;

  if not found then
    raise exception 'User not found' using errcode = '42501';
  end if;

  v_is_self := (v_target.id = v_uid);

  if v_is_self then
    v_friendship_status := 'self';
    v_is_friend := true;
  else
    if exists (
      select 1 from public.friendships
      where user_a = least(v_uid, v_target.id) and user_b = greatest(v_uid, v_target.id)
    ) then
      v_friendship_status := 'friend';
      v_is_friend := true;
    elsif exists (
      select 1 from public.friend_requests
      where sender_id = v_uid and recipient_id = v_target.id and status = 'pending'
    ) then
      v_friendship_status := 'outgoing_request';
    elsif exists (
      select 1 from public.friend_requests
      where sender_id = v_target.id and recipient_id = v_uid and status = 'pending'
    ) then
      v_friendship_status := 'incoming_request';
    else
      v_friendship_status := 'none';
    end if;
  end if;

  select coalesce(allow_direct_messages, true) into v_dm_allowed
  from private.account_preferences
  where user_id = v_target.id;
  if not found then
    v_dm_allowed := true;
  end if;

  v_can_message := v_is_friend and v_dm_allowed and not v_is_self;

  return pg_catalog.jsonb_build_object(
    'id', v_target.id,
    'username', v_target.username,
    'displayName', v_target.display_name,
    'avatarUrl', v_target.avatar_url,
    'friendshipStatus', v_friendship_status,
    'canMessage', v_can_message,
    'allowDirectMessages', v_dm_allowed,
    'education', case when (v_is_self or (v_is_friend and v_target.show_education)) then v_target.education_level else null end,
    'program', case when (v_is_self or (v_is_friend and v_target.show_program)) then v_target.major_or_program else null end,
    'subject', case when (v_is_self or (v_is_friend and v_target.show_subject)) then v_target.primary_subject else null end
  );
end;
$$;

revoke all on function public.get_friend_profile(text) from public, anon;
grant execute on function public.get_friend_profile(text) to authenticated, service_role;

-- 4. Enforce allow_direct_messages in get_or_create_direct_conversation
create or replace function public.get_or_create_direct_conversation(p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_user_a uuid;
  v_user_b uuid;
  v_conversation_id uuid;
  v_participant_user record;
  v_recipient_allows_dm boolean;
  v_result jsonb;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  if p_participant_id is null or p_participant_id = v_caller then
    raise exception 'Cannot create a direct conversation with yourself.';
  end if;

  v_user_a := least(v_caller, p_participant_id);
  v_user_b := greatest(v_caller, p_participant_id);

  if not exists (
    select 1 from public.friendships
    where user_a = v_user_a and user_b = v_user_b
  ) then
    raise exception 'You can only message friends.';
  end if;

  -- Enforce direct message permissions
  select coalesce(allow_direct_messages, true) into v_recipient_allows_dm
  from private.account_preferences
  where user_id = p_participant_id;

  if v_recipient_allows_dm is false then
    raise exception 'This user has direct messages disabled.' using errcode = '42501';
  end if;

  insert into public.conversations (user_a, user_b, updated_at)
  values (v_user_a, v_user_b, now())
  on conflict (user_a, user_b) where user_a is not null and user_b is not null
  do update set updated_at = public.conversations.updated_at
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation_id, v_user_a), (v_conversation_id, v_user_b)
  on conflict (conversation_id, user_id) do nothing;

  select id, username, display_name, avatar_url into v_participant_user
  from public.profiles
  where id = p_participant_id;

  v_result := jsonb_build_object(
    'id', v_conversation_id,
    'participant', jsonb_build_object(
      'id', p_participant_id,
      'username', v_participant_user.username,
      'displayName', coalesce(v_participant_user.display_name, 'Study Buddy'),
      'avatarUrl', v_participant_user.avatar_url
    )
  );

  return v_result;
end;
$$;

revoke execute on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated, service_role;

-- 5. Add artifact_id to live_rooms and update create_live_room to support artifact resolution
alter table public.live_rooms add column if not exists artifact_id uuid references public.study_artifacts(id) on delete set null;

create or replace function public.create_live_room(
  p_pack_id uuid,
  p_artifact_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room_id uuid;
  v_join_code text;
  v_q_count int;
  v_char_pool text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
  v_q record;
  v_pos int := 0;
  v_correct_idx int;
  v_opt_text text;
  v_idx int;
  v_artifact_id uuid := p_artifact_id;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  -- Validate study pack exists and caller is the owner
  if not exists (
    select 1 from public.study_packs
    where id = p_pack_id and owner_id = v_caller
  ) then
    raise exception 'Study pack not found or access denied.';
  end if;

  -- If artifact_id is supplied, validate it belongs to the pack and caller
  if v_artifact_id is not null then
    if not exists (
      select 1 from public.study_artifacts
      where id = v_artifact_id and pack_id = p_pack_id and owner_id = v_caller and kind = 'quiz'
    ) then
      raise exception 'Quiz artifact not found or access denied.';
    end if;
  else
    -- Resolve primary quiz artifact for the pack
    select id into v_artifact_id
    from public.study_artifacts
    where pack_id = p_pack_id and owner_id = v_caller and kind = 'quiz'
    order by created_at asc
    limit 1;
  end if;

  -- Verify questions exist
  if v_artifact_id is not null then
    select count(*) into v_q_count from public.questions where artifact_id = v_artifact_id and kind = 'multiple_choice';
  else
    select count(*) into v_q_count from public.questions where pack_id = p_pack_id and kind = 'multiple_choice';
  end if;

  if v_q_count = 0 then
    raise exception 'Cannot create a live room: this quiz has no eligible multiple-choice questions.';
  end if;

  loop
    v_join_code := '';
    for v_i in 1..6 loop
      v_join_code := v_join_code || substr(v_char_pool, floor(random() * length(v_char_pool) + 1)::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.live_rooms
      where join_code = v_join_code and status in ('lobby', 'active')
    );
  end loop;

  insert into public.live_rooms (
    host_id, pack_id, artifact_id, join_code, status, question_count, current_question_index, version
  ) values (
    v_caller, p_pack_id, v_artifact_id, v_join_code, 'lobby', v_q_count, 0, 1
  ) returning id into v_room_id;

  insert into public.live_room_members (room_id, user_id, score)
  values (v_room_id, v_caller, 0);

  for v_q in
    select q.id, q.prompt, coalesce(q.choices, '[]'::jsonb) as choices, qk.answer, qk.explanation
    from public.questions q
    left join private.question_keys qk on qk.question_id = q.id
    where (case when v_artifact_id is not null then q.artifact_id = v_artifact_id else q.pack_id = p_pack_id end)
      and q.kind = 'multiple_choice'
    order by q.position asc
  loop
    v_correct_idx := 0;
    if jsonb_array_length(v_q.choices) > 0 then
      for v_idx in 0..(jsonb_array_length(v_q.choices) - 1) loop
        v_opt_text := v_q.choices->>v_idx;
        if lower(trim(v_opt_text)) = lower(trim(v_q.answer)) then
          v_correct_idx := v_idx;
          exit;
        end if;
      end loop;
    end if;

    insert into private.live_room_questions (
      room_id, question_index, prompt, options, correct_option_index, explanation
    ) values (
      v_room_id, v_pos, v_q.prompt, v_q.choices, v_correct_idx, v_q.explanation
    );

    v_pos := v_pos + 1;
  end loop;

  return jsonb_build_object(
    'roomId', v_room_id,
    'joinCode', v_join_code,
    'packId', p_pack_id,
    'artifactId', v_artifact_id,
    'status', 'lobby',
    'questionCount', v_q_count
  );
end;
$$;

revoke execute on function public.create_live_room(uuid, uuid) from public;
grant execute on function public.create_live_room(uuid, uuid) to authenticated, service_role;
