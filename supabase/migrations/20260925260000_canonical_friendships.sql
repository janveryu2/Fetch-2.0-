-- Migration: 20260925260000_canonical_friendships.sql
-- Phase 9: Canonical friendships, state-machine transitions, user discovery, and privacy

-- 1. Create canonical friendships table
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friendships_canonical_order check (user_a < user_b),
  constraint friendships_unique_pair unique (user_a, user_b)
);

create index if not exists idx_friendships_user_a on public.friendships(user_a);
create index if not exists idx_friendships_user_b on public.friendships(user_b);

alter table public.friendships enable row level security;

drop policy if exists "Users can view their own friendships" on public.friendships;
create policy "Users can view their own friendships"
on public.friendships for select
to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "Users can delete their own friendships" on public.friendships;
create policy "Users can delete their own friendships"
on public.friendships for delete
to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

revoke insert, update on public.friendships from public, anon, authenticated;
grant select, delete on public.friendships to authenticated;
grant all on public.friendships to postgres, service_role;

-- 2. Friendship state-machine transition RPCs

-- Send friend request
create or replace function public.send_friend_request(p_recipient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req_id uuid;
  v_existing record;
  v_crossed record;
  v_friendship record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_uid = p_recipient_id then
    raise exception 'Cannot send a friend request to yourself' using errcode = '22023';
  end if;

  -- Ensure recipient exists
  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'Recipient user does not exist' using errcode = '42501';
  end if;

  -- Check if already friends
  select * into v_friendship from public.friendships
  where user_a = least(v_uid, p_recipient_id) and user_b = greatest(v_uid, p_recipient_id);

  if found then
    return pg_catalog.jsonb_build_object('status', 'already_friends');
  end if;

  -- Check if recipient already sent sender a pending request (crossed request -> auto-accept!)
  select * into v_crossed from public.friend_requests
  where sender_id = p_recipient_id and recipient_id = v_uid and status = 'pending';

  if found then
    update public.friend_requests
    set status = 'accepted'
    where id = v_crossed.id;

    insert into public.friendships (user_a, user_b)
    values (least(v_uid, p_recipient_id), greatest(v_uid, p_recipient_id))
    on conflict do nothing;

    return pg_catalog.jsonb_build_object('status', 'accepted', 'message', 'Friend request accepted automatically');
  end if;

  -- Check existing request from sender to recipient
  select * into v_existing from public.friend_requests
  where sender_id = v_uid and recipient_id = p_recipient_id;

  if found then
    if v_existing.status = 'pending' then
      return pg_catalog.jsonb_build_object('status', 'already_pending', 'id', v_existing.id);
    elsif v_existing.status = 'declined' then
      update public.friend_requests
      set status = 'pending', created_at = now()
      where id = v_existing.id
      returning id into v_req_id;
      return pg_catalog.jsonb_build_object('status', 'sent', 'id', v_req_id);
    elsif v_existing.status = 'accepted' then
      insert into public.friendships (user_a, user_b)
      values (least(v_uid, p_recipient_id), greatest(v_uid, p_recipient_id))
      on conflict do nothing;
      return pg_catalog.jsonb_build_object('status', 'already_friends');
    end if;
  end if;

  insert into public.friend_requests (sender_id, recipient_id, status)
  values (v_uid, p_recipient_id, 'pending')
  returning id into v_req_id;

  return pg_catalog.jsonb_build_object('status', 'sent', 'id', v_req_id);
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated, service_role;

-- Respond to friend request (accept or decline)
create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_action not in ('accept', 'decline') then
    raise exception 'Invalid action. Must be accept or decline' using errcode = '22023';
  end if;

  select * into v_req from public.friend_requests
  where id = p_request_id and recipient_id = v_uid;

  if not found then
    raise exception 'Friend request not found or unauthorized' using errcode = '42501';
  end if;

  if p_action = 'accept' then
    update public.friend_requests
    set status = 'accepted'
    where id = p_request_id;

    insert into public.friendships (user_a, user_b)
    values (least(v_req.sender_id, v_req.recipient_id), greatest(v_req.sender_id, v_req.recipient_id))
    on conflict do nothing;

    -- Clean up any reverse pending request
    update public.friend_requests
    set status = 'accepted'
    where sender_id = v_req.recipient_id and recipient_id = v_req.sender_id and status = 'pending';

    return pg_catalog.jsonb_build_object('status', 'accepted', 'senderId', v_req.sender_id);
  else
    update public.friend_requests
    set status = 'declined'
    where id = p_request_id;

    return pg_catalog.jsonb_build_object('status', 'declined');
  end if;
end;
$$;

revoke all on function public.respond_friend_request(uuid, text) from public, anon;
grant execute on function public.respond_friend_request(uuid, text) to authenticated, service_role;

-- Cancel outgoing friend request
create or replace function public.cancel_friend_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.friend_requests
  where id = p_request_id and sender_id = v_uid and status = 'pending';

  if not found then
    raise exception 'Pending request not found' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object('status', 'cancelled');
end;
$$;

revoke all on function public.cancel_friend_request(uuid) from public, anon;
grant execute on function public.cancel_friend_request(uuid) to authenticated, service_role;

-- Remove an existing friend
create or replace function public.remove_friend(p_friend_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.friendships
  where user_a = least(v_uid, p_friend_id) and user_b = greatest(v_uid, p_friend_id);

  if not found then
    raise exception 'Friendship not found' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object('status', 'removed');
end;
$$;

revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated, service_role;

-- 3. Controlled user search RPC (No email exposure!)
create or replace function public.search_users(
  p_query text,
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_query text;
  v_bound integer;
  v_results jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_clean_query := pg_catalog.btrim(p_query);
  if v_clean_query like '@%' then
    v_clean_query := pg_catalog.substr(v_clean_query, 2);
  end if;

  if pg_catalog.length(v_clean_query) < 2 then
    return '[]'::jsonb;
  end if;

  v_bound := least(coalesce(p_limit, 10), 20);

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'displayName', p.display_name,
      'avatarUrl', p.avatar_url,
      'friendshipStatus', case
        when exists (
          select 1 from public.friendships f
          where (f.user_a = least(v_uid, p.id) and f.user_b = greatest(v_uid, p.id))
        ) then 'friend'
        when exists (
          select 1 from public.friend_requests fr
          where fr.sender_id = v_uid and fr.recipient_id = p.id and fr.status = 'pending'
        ) then 'outgoing_request'
        when exists (
          select 1 from public.friend_requests fr
          where fr.sender_id = p.id and fr.recipient_id = v_uid and fr.status = 'pending'
        ) then 'incoming_request'
        else 'none'
      end
    )
  ), '[]'::jsonb) into v_results
  from (
    select * from public.profiles
    where id <> v_uid
      and (
        username ilike (v_clean_query || '%')
        or display_name ilike ('%' || v_clean_query || '%')
      )
    order by
      case when username ilike (v_clean_query || '%') then 0 else 1 end,
      display_name asc
    limit v_bound
  ) p;

  return v_results;
end;
$$;

revoke all on function public.search_users(text, integer) from public, anon;
grant execute on function public.search_users(text, integer) to authenticated, service_role;

-- 4. List friends RPC
create or replace function public.list_friends()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_results jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'displayName', p.display_name,
      'avatarUrl', p.avatar_url,
      'friendedAt', f.created_at
    ) order by p.display_name asc
  ), '[]'::jsonb) into v_results
  from public.friendships f
  join public.profiles p on p.id = case when f.user_a = v_uid then f.user_b else f.user_a end
  where f.user_a = v_uid or f.user_b = v_uid;

  return v_results;
end;
$$;

revoke all on function public.list_friends() from public, anon;
grant execute on function public.list_friends() to authenticated, service_role;

-- 5. List friend requests RPC
create or replace function public.list_friend_requests()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_incoming jsonb;
  v_outgoing jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Incoming pending requests
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'requestId', fr.id,
      'userId', p.id,
      'username', p.username,
      'displayName', p.display_name,
      'avatarUrl', p.avatar_url,
      'createdAt', fr.created_at
    ) order by fr.created_at desc
  ), '[]'::jsonb) into v_incoming
  from public.friend_requests fr
  join public.profiles p on p.id = fr.sender_id
  where fr.recipient_id = v_uid and fr.status = 'pending';

  -- Outgoing pending requests
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'requestId', fr.id,
      'userId', p.id,
      'username', p.username,
      'displayName', p.display_name,
      'avatarUrl', p.avatar_url,
      'createdAt', fr.created_at
    ) order by fr.created_at desc
  ), '[]'::jsonb) into v_outgoing
  from public.friend_requests fr
  join public.profiles p on p.id = fr.recipient_id
  where fr.sender_id = v_uid and fr.status = 'pending';

  return pg_catalog.jsonb_build_object(
    'incoming', v_incoming,
    'outgoing', v_outgoing
  );
end;
$$;

revoke all on function public.list_friend_requests() from public, anon;
grant execute on function public.list_friend_requests() to authenticated, service_role;
