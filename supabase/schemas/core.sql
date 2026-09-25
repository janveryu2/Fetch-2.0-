create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_packs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  source_type text not null check (source_type in ('text','pdf','url')),
  source_label text not null,
  status text not null default 'ready' check (status in ('processing','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.study_sources (
  pack_id uuid primary key references public.study_packs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  pack_id uuid not null references public.study_packs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  kind text not null check (kind in ('multiple_choice','fill_blank')),
  prompt text not null,
  choices jsonb not null default '[]'::jsonb,
  unique (pack_id, position)
);

create table if not exists private.question_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  answer text not null,
  explanation text not null,
  source_quote text not null
);

create table if not exists private.tutor_conversations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid references public.study_packs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.tutor_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  conversation_id uuid not null references private.tutor_conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);

create table if not exists private.tutor_rate_limits (
  owner_id uuid not null references auth.users(id) on delete cascade,
  window_bucket bigint not null,
  request_count integer not null check (request_count between 1 and 10),
  primary key (owner_id, window_bucket)
);

create table if not exists public.study_sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references public.study_packs(id) on delete cascade,
  client_attempt_id uuid,
  score integer not null check (score between 0 and 100),
  correct_count integer not null check (correct_count >= 0),
  question_count integer not null check (question_count > 0),
  completed_at timestamptz not null default now(),
  unique (user_id, client_attempt_id)
);

create table if not exists public.calendar_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  event_type text not null check (event_type in ('study','exam','deadline')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  event_date date not null,
  start_time time,
  end_time time,
  all_day boolean not null default false,
  color text not null default '#1065e6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  subject text not null default '' check (char_length(subject) <= 100),
  location text not null default '' check (char_length(location) <= 150),
  pack_id uuid references public.study_packs(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (all_day or (start_time is not null and end_time is not null and end_time > start_time))
);

create table if not exists public.friend_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (sender_id, recipient_id),
  check (sender_id <> recipient_id)
);

create table if not exists public.conversations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.live_rooms (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references public.study_packs(id) on delete cascade,
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'lobby' check (status in ('lobby','active','complete')),
  created_at timestamptz not null default now()
);

create index if not exists study_packs_owner_idx on public.study_packs(owner_id);
create index if not exists questions_owner_idx on public.questions(owner_id);
create index if not exists questions_pack_idx on public.questions(pack_id);
create index if not exists events_user_date_idx on public.calendar_events(user_id, event_date);
create index if not exists sessions_user_completed_idx on public.study_sessions(user_id, completed_at desc);
create index if not exists sessions_pack_idx on public.study_sessions(pack_id);
create index if not exists tutor_conversations_owner_updated_idx on private.tutor_conversations(owner_id, updated_at desc);
create index if not exists tutor_messages_conversation_created_idx on private.tutor_messages(conversation_id, created_at desc);
create index if not exists requests_sender_idx on public.friend_requests(sender_id);
create index if not exists requests_recipient_idx on public.friend_requests(recipient_id);
create index if not exists members_user_idx on public.conversation_members(user_id);
create index if not exists messages_conversation_idx on public.messages(conversation_id);

alter table public.profiles enable row level security;
alter table public.study_packs enable row level security;
alter table public.questions enable row level security;
alter table public.study_sessions enable row level security;
alter table public.calendar_events enable row level security;
alter table public.friend_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.live_rooms enable row level security;
alter table private.study_sources enable row level security;
alter table private.question_keys enable row level security;
alter table private.tutor_conversations enable row level security;
alter table private.tutor_messages enable row level security;
alter table private.tutor_rate_limits enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.study_packs to authenticated;
grant select, insert, update, delete on public.calendar_events, public.friend_requests to authenticated;
grant select on public.questions to authenticated;
grant select on public.study_sessions to authenticated;
grant select, insert on public.conversations, public.conversation_members, public.messages, public.live_rooms to authenticated;
revoke all on private.study_sources, private.question_keys, private.tutor_conversations, private.tutor_messages from anon, authenticated;
revoke all on private.tutor_rate_limits from anon, authenticated;

create policy "profiles_read_authenticated" on public.profiles for select to authenticated using (true);
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_self" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "packs_read_owner" on public.study_packs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "questions_read_owner" on public.questions for select to authenticated using ((select auth.uid()) = owner_id);
create policy "sessions_read_self" on public.study_sessions for select to authenticated using ((select auth.uid()) = user_id);

create policy "events_read_self" on public.calendar_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "events_insert_self" on public.calendar_events for insert to authenticated
  with check ((select auth.uid()) = user_id and (pack_id is null or exists (
    select 1 from public.study_packs as pack where pack.id = pack_id and pack.owner_id = (select auth.uid())
  )));
create policy "events_update_self" on public.calendar_events for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (pack_id is null or exists (
    select 1 from public.study_packs as pack where pack.id = pack_id and pack.owner_id = (select auth.uid())
  )));
create policy "events_delete_self" on public.calendar_events for delete to authenticated using ((select auth.uid()) = user_id);

create policy "requests_read_participant" on public.friend_requests for select to authenticated using ((select auth.uid()) in (sender_id, recipient_id));
create policy "requests_insert_sender" on public.friend_requests for insert to authenticated with check ((select auth.uid()) = sender_id);
create policy "requests_update_recipient" on public.friend_requests for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
create policy "requests_delete_participant" on public.friend_requests for delete to authenticated using ((select auth.uid()) in (sender_id, recipient_id));

create function private.user_conversation_ids() returns setof uuid language sql security definer set search_path = '' stable as $$
  select conversation_id from public.conversation_members where user_id = (select auth.uid())
$$;
revoke execute on function private.user_conversation_ids() from public;
grant usage on schema private to authenticated;
grant execute on function private.user_conversation_ids() to authenticated;

create policy "conversations_read_members" on public.conversations for select to authenticated using (id in (select private.user_conversation_ids()));
create policy "conversations_create" on public.conversations for insert to authenticated with check (true);
create policy "members_read_members" on public.conversation_members for select to authenticated using (conversation_id in (select private.user_conversation_ids()));
create policy "members_join_self" on public.conversation_members for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "messages_read_members" on public.messages for select to authenticated using (conversation_id in (select private.user_conversation_ids()));
create policy "messages_send_as_self" on public.messages for insert to authenticated with check ((select auth.uid()) = sender_id and conversation_id in (select private.user_conversation_ids()));
create policy "rooms_read_authenticated" on public.live_rooms for select to authenticated using (true);
create policy "rooms_create_host" on public.live_rooms for insert to authenticated with check ((select auth.uid()) = host_id);

-- Answer keys and source material remain in the private schema and are accessed only
-- by narrow, authenticated RPC wrappers. Private SECURITY DEFINER functions validate
-- auth.uid(), pin search_path, and are never exposed directly through the Data API.

create function private.persist_study_pack(
  p_title text,
  p_source_type text,
  p_source_label text,
  p_source_content text,
  p_content_hash text,
  p_questions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_pack_id uuid := pg_catalog.gen_random_uuid();
  v_question_id uuid;
  v_item jsonb;
  v_position integer;
  v_kind text;
  v_prompt text;
  v_answer text;
  v_explanation text;
  v_source_quote text;
  v_choices jsonb;
  v_safe_questions jsonb := '[]'::jsonb;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_title is null
    or p_source_type is null
    or p_source_label is null
    or p_source_content is null
    or p_content_hash is null
    or p_questions is null
    or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 80
    or p_source_type not in ('text', 'pdf', 'url')
    or pg_catalog.char_length(pg_catalog.btrim(p_source_label)) not between 1 and 120
    or pg_catalog.char_length(p_source_content) not between 80 and 20000
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_questions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_questions) not between 3 and 20 then
    raise exception 'Invalid StudyPack' using errcode = '22023';
  end if;

  insert into public.study_packs (id, owner_id, title, source_type, source_label, status)
  values (v_pack_id, v_owner, pg_catalog.btrim(p_title), p_source_type, pg_catalog.btrim(p_source_label), 'processing');

  for v_item, v_position in
    select item, (ordinality - 1)::integer
    from pg_catalog.jsonb_array_elements(p_questions) with ordinality as question(item, ordinality)
  loop
    v_kind := v_item->>'type';
    v_prompt := pg_catalog.btrim(v_item->>'prompt');
    v_answer := pg_catalog.btrim(v_item->>'answer');
    v_explanation := pg_catalog.btrim(v_item->>'explanation');
    v_source_quote := pg_catalog.btrim(coalesce(v_item->>'sourceQuote', v_item->>'explanation'));
    v_choices := coalesce(v_item->'choices', '[]'::jsonb);

    if v_kind is null
      or v_kind not in ('multiple_choice', 'fill_blank')
      or pg_catalog.char_length(v_prompt) not between 1 and 2000
      or pg_catalog.char_length(v_answer) not between 1 and 1000
      or pg_catalog.char_length(v_explanation) not between 1 and 4000
      or pg_catalog.char_length(v_source_quote) not between 1 and 2000
      or pg_catalog.jsonb_typeof(v_choices) is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_choices) > 6
      or (v_kind = 'multiple_choice' and (
        pg_catalog.jsonb_array_length(v_choices) < 2
        or not exists (
          select 1 from pg_catalog.jsonb_array_elements(v_choices) as choice(value)
          where choice.value #>> '{}' = v_answer
        )
      ))
      or (v_kind = 'fill_blank' and pg_catalog.jsonb_array_length(v_choices) <> 0)
      or exists (
        select 1 from pg_catalog.jsonb_array_elements(v_choices) as choice(value)
        where pg_catalog.jsonb_typeof(choice.value) <> 'string'
          or pg_catalog.char_length(choice.value #>> '{}') > 300
      ) then
      raise exception 'Invalid StudyPack question' using errcode = '22023';
    end if;

    v_question_id := pg_catalog.gen_random_uuid();
    insert into public.questions (id, pack_id, owner_id, position, kind, prompt, choices)
    values (v_question_id, v_pack_id, v_owner, v_position, v_kind, v_prompt, v_choices);
    insert into private.question_keys (question_id, owner_id, answer, explanation, source_quote)
    values (v_question_id, v_owner, v_answer, v_explanation, v_source_quote);
    v_safe_questions := v_safe_questions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_question_id,
        'type', v_kind,
        'prompt', v_prompt,
        'choices', v_choices
      )
    );
  end loop;

  insert into private.study_sources (pack_id, owner_id, content, content_hash)
  values (
    v_pack_id,
    v_owner,
    p_source_content,
    p_content_hash
  );
  update public.study_packs set status = 'ready', updated_at = pg_catalog.now()
  where id = v_pack_id and owner_id = v_owner;

  return pg_catalog.jsonb_build_object('id', v_pack_id, 'questions', v_safe_questions);
end;
$$;

create function public.create_study_pack(
  p_title text,
  p_source_type text,
  p_source_label text,
  p_source_content text,
  p_content_hash text,
  p_questions jsonb
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.persist_study_pack(p_title, p_source_type, p_source_label, p_source_content, p_content_hash, p_questions);
$$;

create function private.grade_study_answer(p_pack_id uuid, p_question_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_key private.question_keys%rowtype;
begin
  if v_owner is null or not exists (
    select 1 from public.study_packs where id = p_pack_id and owner_id = v_owner and status = 'ready'
  ) then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;
  if p_answer is null or pg_catalog.char_length(pg_catalog.btrim(p_answer)) not between 1 and 1000 then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;
  select answer_key.* into v_key
  from private.question_keys as answer_key
  join public.questions as question on question.id = answer_key.question_id
  where question.id = p_question_id
    and question.pack_id = p_pack_id
    and question.owner_id = v_owner
    and answer_key.owner_id = v_owner;
  if not found then
    raise exception 'Question not found' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'correct', pg_catalog.lower(pg_catalog.btrim(p_answer)) = pg_catalog.lower(pg_catalog.btrim(v_key.answer)),
    'answer', v_key.answer,
    'explanation', v_key.explanation
  );
end;
$$;

create function public.grade_study_answer(p_pack_id uuid, p_question_id uuid, p_answer text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.grade_study_answer(p_pack_id, p_question_id, p_answer); $$;

create function private.complete_study_attempt(
  p_pack_id uuid,
  p_answers jsonb,
  p_client_attempt_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_question_count integer;
  v_correct_count integer;
  v_attempt_id uuid;
  v_completed_at timestamptz;
  v_existing_score integer;
begin
  if v_owner is null or not exists (
    select 1 from public.study_packs where id = p_pack_id and owner_id = v_owner and status = 'ready'
  ) then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;

  if p_client_attempt_id is not null then
    select s.id, s.completed_at, s.score, s.correct_count, s.question_count
    into v_attempt_id, v_completed_at, v_existing_score, v_correct_count, v_question_count
    from public.study_sessions as s
    where s.user_id = v_owner and s.client_attempt_id = p_client_attempt_id;

    if found then
      return pg_catalog.jsonb_build_object(
        'id', v_attempt_id,
        'packId', p_pack_id,
        'score', v_existing_score,
        'correct', v_correct_count,
        'total', v_question_count,
        'completedAt', v_completed_at
      );
    end if;
  end if;

  if pg_catalog.jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Invalid answers' using errcode = '22023';
  end if;
  select pg_catalog.count(*)::integer into v_question_count
  from public.questions where pack_id = p_pack_id and owner_id = v_owner;
  if v_question_count = 0 or pg_catalog.jsonb_array_length(p_answers) <> v_question_count then
    raise exception 'Submit one answer per question' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
    where submitted.question_id is null
      or submitted.answer is null
      or pg_catalog.char_length(pg_catalog.btrim(submitted.answer)) not between 1 and 1000
      or not exists (
        select 1 from public.questions as question
        where question.id = submitted.question_id
          and question.pack_id = p_pack_id
          and question.owner_id = v_owner
      )
  ) or exists (
    select submitted.question_id
    from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
    group by submitted.question_id having pg_catalog.count(*) <> 1
  ) then
    raise exception 'Answers do not match this StudyPack' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer into v_correct_count
  from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
  join public.questions as question
    on question.id = submitted.question_id and question.pack_id = p_pack_id and question.owner_id = v_owner
  join private.question_keys as answer_key
    on answer_key.question_id = question.id and answer_key.owner_id = v_owner
  where pg_catalog.lower(pg_catalog.btrim(submitted.answer)) = pg_catalog.lower(pg_catalog.btrim(answer_key.answer));

  insert into public.study_sessions (user_id, pack_id, client_attempt_id, score, correct_count, question_count)
  values (v_owner, p_pack_id, p_client_attempt_id, pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer, v_correct_count, v_question_count)
  returning id, completed_at into v_attempt_id, v_completed_at;

  return pg_catalog.jsonb_build_object(
    'id', v_attempt_id,
    'packId', p_pack_id,
    'score', pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer,
    'correct', v_correct_count,
    'total', v_question_count,
    'completedAt', v_completed_at
  );
end;
$$;

create function public.complete_study_attempt(
  p_pack_id uuid,
  p_answers jsonb,
  p_client_attempt_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.complete_study_attempt(p_pack_id, p_answers, p_client_attempt_id); $$;

create function private.get_owned_study_source(p_pack_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_content text;
begin
  select source.content into v_content
  from public.study_packs as pack
  join private.study_sources as source on source.pack_id = pack.id and source.owner_id = pack.owner_id
  where pack.id = p_pack_id and pack.owner_id = v_owner and source.owner_id = v_owner;
  if not found then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;
  return v_content;
end;
$$;

create function public.get_owned_study_source(p_pack_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.get_owned_study_source(p_pack_id); $$;

create function private.consume_tutor_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_bucket bigint;
  v_count integer;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  v_bucket := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now()) / 600)::bigint;
  insert into private.tutor_rate_limits (owner_id, window_bucket, request_count)
  values (v_owner, v_bucket, 1)
  on conflict (owner_id, window_bucket) do update
    set request_count = private.tutor_rate_limits.request_count + 1
    where private.tutor_rate_limits.request_count < 10
  returning request_count into v_count;
  return v_count is not null;
end;
$$;

create function public.consume_tutor_quota()
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.consume_tutor_quota(); $$;

create function private.read_tutor_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_messages jsonb;
begin
  if v_owner is null or not exists (
    select 1 from private.tutor_conversations
    where id = p_conversation_id and owner_id = v_owner
  ) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', recent.role, 'content', recent.content) order by recent.created_at),
    '[]'::jsonb
  ) into v_messages
  from (
    select message.role, message.content, message.created_at
    from private.tutor_messages as message
    where message.conversation_id = p_conversation_id and message.owner_id = v_owner
    order by message.created_at desc
    limit 12
  ) as recent;
  return v_messages;
end;
$$;

create function private.list_tutor_conversations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_conversations jsonb;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', conversation.id,
        'packId', conversation.pack_id,
        'updatedAt', conversation.updated_at,
        'preview', conversation.preview
      ) order by conversation.updated_at desc
    ),
    '[]'::jsonb
  ) into v_conversations
  from (
    select tutor.id, tutor.pack_id, tutor.updated_at,
      (
        select pg_catalog.left(message.content, 120)
        from private.tutor_messages as message
        where message.conversation_id = tutor.id
          and message.owner_id = v_owner
          and message.role = 'user'
        order by message.created_at desc
        limit 1
      ) as preview
    from private.tutor_conversations as tutor
    where tutor.owner_id = v_owner
    order by tutor.updated_at desc
    limit 20
  ) as conversation;
  return v_conversations;
end;
$$;

create function public.list_tutor_conversations()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.list_tutor_conversations(); $$;

create function public.read_tutor_conversation(p_conversation_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.read_tutor_conversation(p_conversation_id); $$;

create function private.save_tutor_exchange(
  p_conversation_id uuid,
  p_pack_id uuid,
  p_user_content text,
  p_assistant_content text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_conversation_id uuid := p_conversation_id;
  v_existing_pack_id uuid;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_user_content is null
    or p_assistant_content is null
    or pg_catalog.char_length(pg_catalog.btrim(p_user_content)) not between 1 and 4000
    or pg_catalog.char_length(pg_catalog.btrim(p_assistant_content)) not between 1 and 8000 then
    raise exception 'Invalid tutor message' using errcode = '22023';
  end if;
  if p_pack_id is not null and not exists (
    select 1 from public.study_packs where id = p_pack_id and owner_id = v_owner and status = 'ready'
  ) then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;
  if v_conversation_id is null then
    insert into private.tutor_conversations (owner_id, pack_id)
    values (v_owner, p_pack_id) returning id into v_conversation_id;
  else
    select pack_id into v_existing_pack_id
    from private.tutor_conversations
    where id = v_conversation_id and owner_id = v_owner
    for update;
    if not found or v_existing_pack_id is distinct from p_pack_id then
      raise exception 'Conversation not found' using errcode = '42501';
    end if;
  end if;
  insert into private.tutor_messages (conversation_id, owner_id, role, content)
  values (v_conversation_id, v_owner, 'user', pg_catalog.btrim(p_user_content));
  insert into private.tutor_messages (conversation_id, owner_id, role, content)
  values (v_conversation_id, v_owner, 'assistant', pg_catalog.btrim(p_assistant_content));
  update private.tutor_conversations set updated_at = pg_catalog.now()
  where id = v_conversation_id and owner_id = v_owner;
  return v_conversation_id;
end;
$$;

create function public.save_tutor_exchange(
  p_conversation_id uuid,
  p_pack_id uuid,
  p_user_content text,
  p_assistant_content text
) returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.save_tutor_exchange(p_conversation_id, p_pack_id, p_user_content, p_assistant_content); $$;

revoke all on function private.persist_study_pack(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.grade_study_answer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.complete_study_attempt(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.get_owned_study_source(uuid) from public, anon, authenticated;
revoke all on function private.consume_tutor_quota() from public, anon, authenticated;
revoke all on function private.read_tutor_conversation(uuid) from public, anon, authenticated;
revoke all on function private.list_tutor_conversations() from public, anon, authenticated;
revoke all on function private.save_tutor_exchange(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.persist_study_pack(text, text, text, text, text, jsonb) to authenticated;
grant execute on function private.grade_study_answer(uuid, uuid, text) to authenticated;
grant execute on function private.complete_study_attempt(uuid, jsonb) to authenticated;
grant execute on function private.get_owned_study_source(uuid) to authenticated;
grant execute on function private.consume_tutor_quota() to authenticated;
grant execute on function private.read_tutor_conversation(uuid) to authenticated;
grant execute on function private.list_tutor_conversations() to authenticated;
grant execute on function private.save_tutor_exchange(uuid, uuid, text, text) to authenticated;

revoke all on function public.create_study_pack(text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.grade_study_answer(uuid, uuid, text) from public, anon;
revoke all on function public.complete_study_attempt(uuid, jsonb) from public, anon;
revoke all on function public.get_owned_study_source(uuid) from public, anon;
revoke all on function public.consume_tutor_quota() from public, anon;
revoke all on function public.read_tutor_conversation(uuid) from public, anon;
revoke all on function public.list_tutor_conversations() from public, anon;
revoke all on function public.save_tutor_exchange(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_study_pack(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.grade_study_answer(uuid, uuid, text) to authenticated;
grant execute on function public.complete_study_attempt(uuid, jsonb) to authenticated;
grant execute on function public.get_owned_study_source(uuid) to authenticated;
grant execute on function public.consume_tutor_quota() to authenticated;
grant execute on function public.read_tutor_conversation(uuid) to authenticated;
grant execute on function public.list_tutor_conversations() to authenticated;
grant execute on function public.save_tutor_exchange(uuid, uuid, text, text) to authenticated;
