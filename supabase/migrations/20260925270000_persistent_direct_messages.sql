-- Migration: Persistent Direct Messages & Secure Pair Creation
-- Adds canonical direct-pair enforcement on public.conversations,
-- client_message_id for send idempotency on public.messages,
-- secure RPCs for pair creation, messaging, and cursor pagination.

-- 1. Ensure columns and constraints on public.conversations
alter table public.conversations add column if not exists user_a uuid references auth.users(id) on delete cascade;
alter table public.conversations add column if not exists user_b uuid references auth.users(id) on delete cascade;
alter table public.conversations add column if not exists updated_at timestamptz not null default now();

alter table public.conversations drop constraint if exists conversations_canonical_pair;
alter table public.conversations add constraint conversations_canonical_pair check (user_a is null or user_a < user_b);

create unique index if not exists conversations_unique_direct_pair
  on public.conversations(user_a, user_b)
  where user_a is not null and user_b is not null;

create index if not exists conversations_user_a_updated_idx on public.conversations(user_a, updated_at desc);
create index if not exists conversations_user_b_updated_idx on public.conversations(user_b, updated_at desc);

-- 2. Ensure columns and indexes on public.messages
alter table public.messages add column if not exists client_message_id text;

create unique index if not exists messages_conversation_client_id_idx
  on public.messages(conversation_id, client_message_id)
  where client_message_id is not null;

create index if not exists messages_conversation_created_asc_idx
  on public.messages(conversation_id, created_at asc);

create index if not exists messages_conversation_created_desc_idx
  on public.messages(conversation_id, created_at desc);

-- 3. Revoke unsafe direct member modifications from authenticated users
revoke insert, update, delete on public.conversation_members from authenticated, anon;

-- 4. Enable Supabase Realtime for public.messages if publication exists
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end $$;

-- 5. RPC: Get or Create Direct Conversation
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
  v_result jsonb;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  if p_participant_id is null or p_participant_id = v_caller then
    raise exception 'Cannot create a direct conversation with yourself.';
  end if;

  -- Verify users are friends
  v_user_a := least(v_caller, p_participant_id);
  v_user_b := greatest(v_caller, p_participant_id);

  if not exists (
    select 1 from public.friendships
    where user_a = v_user_a and user_b = v_user_b
  ) then
    raise exception 'You can only message friends.';
  end if;

  -- Insert or get existing direct conversation atomically
  insert into public.conversations (user_a, user_b, updated_at)
  values (v_user_a, v_user_b, now())
  on conflict (user_a, user_b) where user_a is not null and user_b is not null
  do update set updated_at = public.conversations.updated_at
  returning id into v_conversation_id;

  -- Ensure membership rows exist
  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation_id, v_user_a), (v_conversation_id, v_user_b)
  on conflict (conversation_id, user_id) do nothing;

  -- Fetch participant profile
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
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- 6. RPC: List User Direct Conversations
create or replace function public.list_user_conversations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_conversations jsonb;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select coalesce(jsonb_agg(conv_row), '[]'::jsonb)
  into v_conversations
  from (
    select
      c.id,
      c.updated_at as "updatedAt",
      c.created_at as "createdAt",
      jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'displayName', coalesce(p.display_name, 'Study Buddy'),
        'avatarUrl', p.avatar_url
      ) as participant,
      (
        select jsonb_build_object(
          'id', m.id,
          'senderId', m.sender_id,
          'body', m.body,
          'createdAt', m.created_at,
          'mine', (m.sender_id = v_caller)
        )
        from public.messages m
        where m.conversation_id = c.id
        order by m.created_at desc
        limit 1
      ) as "lastMessage"
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = v_caller
    cross join lateral (
      select case when c.user_a = v_caller then c.user_b else c.user_a end as other_id
    ) other
    join public.profiles p on p.id = other.other_id
    order by c.updated_at desc
  ) conv_row;

  return v_conversations;
end;
$$;

revoke execute on function public.list_user_conversations() from public;
grant execute on function public.list_user_conversations() to authenticated;

-- 7. RPC: Send Direct Message
create or replace function public.send_direct_message(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_existing jsonb;
  v_msg record;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  if p_body is null or length(trim(p_body)) < 1 or length(p_body) > 4000 then
    raise exception 'Message body must be between 1 and 4000 characters.';
  end if;

  -- Validate caller is a member of the conversation
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = v_caller
  ) then
    raise exception 'Not authorized to send messages to this conversation.';
  end if;

  -- Idempotency check: if client_message_id is supplied and already recorded, replay
  if p_client_message_id is not null then
    select jsonb_build_object(
      'id', id,
      'conversationId', conversation_id,
      'senderId', sender_id,
      'body', body,
      'createdAt', created_at,
      'clientMessageId', client_message_id,
      'mine', true
    ) into v_existing
    from public.messages
    where conversation_id = p_conversation_id and client_message_id = p_client_message_id;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- Insert message
  insert into public.messages (conversation_id, sender_id, body, client_message_id)
  values (p_conversation_id, v_caller, trim(p_body), p_client_message_id)
  returning id, conversation_id, sender_id, body, created_at, client_message_id
  into v_msg;

  -- Update conversation updated_at for ordering
  update public.conversations
  set updated_at = now()
  where id = p_conversation_id;

  return jsonb_build_object(
    'id', v_msg.id,
    'conversationId', v_msg.conversation_id,
    'senderId', v_msg.sender_id,
    'body', v_msg.body,
    'createdAt', v_msg.created_at,
    'clientMessageId', v_msg.client_message_id,
    'mine', true
  );
end;
$$;

revoke execute on function public.send_direct_message(uuid, text, text) from public;
grant execute on function public.send_direct_message(uuid, text, text) to authenticated;

-- 8. RPC: List Direct Messages (Paginated)
create or replace function public.list_direct_messages(
  p_conversation_id uuid,
  p_limit int default 50,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_clamped_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_messages jsonb;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  -- Validate membership
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = v_caller
  ) then
    raise exception 'Not authorized to read messages from this conversation.';
  end if;

  select coalesce(jsonb_agg(m_row order by m_row."createdAt" asc), '[]'::jsonb)
  into v_messages
  from (
    select
      m.id,
      m.conversation_id as "conversationId",
      m.sender_id as "senderId",
      m.body,
      m.created_at as "createdAt",
      m.client_message_id as "clientMessageId",
      (m.sender_id = v_caller) as mine
    from public.messages m
    where m.conversation_id = p_conversation_id
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit v_clamped_limit
  ) m_row;

  return v_messages;
end;
$$;

revoke execute on function public.list_direct_messages(uuid, int, timestamptz) from public;
grant execute on function public.list_direct_messages(uuid, int, timestamptz) to authenticated;
