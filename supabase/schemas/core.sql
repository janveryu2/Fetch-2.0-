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
  source_type text not null check (source_type in ('text','pdf','url','manual','scan')),
  source_label text not null,
  status text not null default 'ready' check (status in ('processing','ready','failed')),
  archived_at timestamptz default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_artifacts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  pack_id uuid not null references public.study_packs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quiz', 'flashcards', 'summary')),
  origin text not null check (origin in ('generated', 'manual')),
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  title text not null check (char_length(title) between 1 and 120),
  version integer not null default 1 check (version > 0),
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
  artifact_id uuid references public.study_artifacts(id) on delete cascade,
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
  request_hash text default null,
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

-- Phase 1 Foundation Tables
create table if not exists private.generation_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null,
  utc_month_key text not null check (utc_month_key ~ '^\d{4}-\d{2}$'),
  state text not null check (state in ('reserved', 'processing', 'committed', 'released', 'expired')),
  fencing_token bigint not null default 1,
  pack_id uuid references public.study_packs(id) on delete set null,
  failure_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, request_id)
);

create table if not exists private.monthly_ai_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^\d{4}-\d{2}$'),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  committed_count integer not null default 0 check (committed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, month_key)
);

create table if not exists private.account_entitlement_overrides (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  allowance integer not null check (allowance >= 0),
  effective_from timestamptz not null default now(),
  effective_until timestamptz default null
);

create table if not exists public.study_session_answers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  submitted_answer text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  ordinal integer not null,
  unique (session_id, question_id)
);

create table if not exists public.study_session_drafts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references public.study_packs(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  current_position integer not null default 0,
  current_answer text not null default '',
  checked boolean not null default false,
  feedback jsonb default null,
  client_attempt_id uuid default null,
  pack_fingerprint text default null,
  revision integer not null default 1,
  expires_at timestamptz not null default (now() + interval '30 days'),
  updated_at timestamptz not null default now(),
  unique (user_id, pack_id)
);

create table if not exists private.source_documents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text,
  file_size_bytes bigint not null,
  content_hash text not null,
  page_count integer,
  extracted_text text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'extracted', 'processed', 'failed')),
  linked_pack_id uuid references public.study_packs(id) on delete set null,
  failure_reason text,
  cleanup_state text not null default 'retained' check (cleanup_state in ('retained', 'cleaned', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_source_documents_linked_pack
  on private.source_documents(linked_pack_id)
  where linked_pack_id is not null;

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
create index if not exists generation_requests_owner_month_idx on private.generation_requests(owner_id, utc_month_key);
create index if not exists study_session_answers_session_idx on public.study_session_answers(session_id);
create index if not exists study_session_answers_session_ordinal_idx on public.study_session_answers(session_id, ordinal);
create index if not exists study_packs_owner_archived_idx on public.study_packs(owner_id, archived_at);
create index if not exists study_sessions_user_completed_idx on public.study_sessions(user_id, completed_at desc);
create index if not exists study_session_drafts_user_pack_idx on public.study_session_drafts(user_id, pack_id);
create index if not exists study_session_drafts_user_pack_expires_idx on public.study_session_drafts(user_id, pack_id, expires_at);
create index if not exists source_documents_owner_idx on private.source_documents(owner_id);

alter table public.profiles enable row level security;
alter table public.study_packs enable row level security;
alter table public.study_artifacts enable row level security;
alter table public.questions enable row level security;
alter table public.study_sessions enable row level security;
alter table public.calendar_events enable row level security;
alter table public.friend_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.live_rooms enable row level security;
alter table public.study_session_answers enable row level security;
alter table public.study_session_drafts enable row level security;
alter table private.study_sources enable row level security;
alter table private.question_keys enable row level security;
alter table private.tutor_conversations enable row level security;
alter table private.tutor_messages enable row level security;
alter table private.tutor_rate_limits enable row level security;
alter table private.generation_requests enable row level security;
alter table private.monthly_ai_usage enable row level security;
alter table private.source_documents enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.study_packs to authenticated;
grant select, insert, update, delete on public.study_artifacts to authenticated, service_role;
grant select, insert, update, delete on public.calendar_events, public.friend_requests to authenticated;
grant select on public.questions to authenticated;
grant select on public.study_sessions to authenticated;
grant select on public.study_session_answers to authenticated;
grant select, insert, update, delete on public.study_session_drafts to authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.live_rooms to authenticated;
revoke all on private.study_sources, private.question_keys, private.tutor_conversations, private.tutor_messages from anon, authenticated;
revoke all on private.tutor_rate_limits, private.generation_requests, private.monthly_ai_usage, private.source_documents from anon, authenticated;

create policy "profiles_read_self" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_self" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "packs_read_owner" on public.study_packs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "artifacts_read_owner" on public.study_artifacts for select to authenticated using ((select auth.uid()) = owner_id);
create policy "artifacts_insert_owner" on public.study_artifacts for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "artifacts_update_owner" on public.study_artifacts for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "artifacts_delete_owner" on public.study_artifacts for delete to authenticated using ((select auth.uid()) = owner_id);
create policy "questions_read_owner" on public.questions for select to authenticated using ((select auth.uid()) = owner_id);
create policy "sessions_read_self" on public.study_sessions for select to authenticated using ((select auth.uid()) = user_id);

create policy "answers_read_session_owner" on public.study_session_answers
  for select to authenticated
  using (exists (
    select 1 from public.study_sessions as session
    where session.id = session_id and session.user_id = (select auth.uid())
  ));

create policy "drafts_owner_all" on public.study_session_drafts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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
create policy "members_read_members" on public.conversation_members for select to authenticated using (conversation_id in (select private.user_conversation_ids()));
create policy "messages_read_members" on public.messages for select to authenticated using (conversation_id in (select private.user_conversation_ids()));
create policy "messages_send_as_self" on public.messages for insert to authenticated with check ((select auth.uid()) = sender_id and conversation_id in (select private.user_conversation_ids()));
create policy "rooms_read_host" on public.live_rooms for select to authenticated using ((select auth.uid()) = host_id);
create policy "rooms_create_host" on public.live_rooms for insert to authenticated with check ((select auth.uid()) = host_id);

-- Answer keys and source material remain in the private schema and are accessed only
-- by narrow, authenticated RPC wrappers. Private SECURITY DEFINER functions validate
-- auth.uid(), pin search_path, and are never exposed directly through the Data API.

create or replace function private.persist_study_pack(
  p_title text,
  p_source_type text,
  p_source_label text,
  p_source_content text,
  p_content_hash text,
  p_questions jsonb,
  p_owner_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_auth_uid uuid := (select auth.uid());
  v_owner uuid;
  v_pack_id uuid := pg_catalog.gen_random_uuid();
  v_artifact_id uuid := pg_catalog.gen_random_uuid();
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
  if p_owner_id is not null then
    if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
      raise exception 'Only server operations may specify owner' using errcode = '42501';
    end if;
    v_owner := p_owner_id;
  else
    v_owner := v_auth_uid;
  end if;

  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = v_owner) then
    raise exception 'Owner not found' using errcode = '42501';
  end if;

  if p_title is null
    or p_source_type is null
    or p_source_label is null
    or p_source_content is null
    or p_content_hash is null
    or p_questions is null
    or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 80
    or p_source_type not in ('text', 'pdf', 'url', 'manual')
    or pg_catalog.char_length(pg_catalog.btrim(p_source_label)) not between 1 and 120
    or pg_catalog.char_length(p_source_content) not between 80 and 20000
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_questions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_questions) not between 3 and 20 then
    raise exception 'Invalid StudyPack' using errcode = '22023';
  end if;

  -- 1. Insert parent study pack
  insert into public.study_packs (id, owner_id, title, source_type, source_label, status)
  values (v_pack_id, v_owner, pg_catalog.btrim(p_title), p_source_type, pg_catalog.btrim(p_source_label), 'processing');

  -- 2. Insert primary quiz artifact
  insert into public.study_artifacts (id, pack_id, owner_id, kind, origin, status, title, version)
  values (v_artifact_id, v_pack_id, v_owner, 'quiz', 'generated', 'processing', pg_catalog.btrim(p_title), 1);

  -- 3. Insert questions linked to both pack and artifact
  for v_item, v_position in
    select item, (ordinality - 1)::integer
    from pg_catalog.jsonb_array_elements(p_questions) with ordinality as question(item, ordinality)
  loop
    v_kind := coalesce(v_item->>'kind', v_item->>'type');
    v_prompt := pg_catalog.btrim(v_item->>'prompt');
    v_answer := pg_catalog.btrim(v_item->>'answer');
    v_explanation := coalesce(pg_catalog.btrim(v_item->>'explanation'), '');
    v_source_quote := coalesce(pg_catalog.btrim(v_item->>'sourceQuote'), '');
    v_choices := coalesce(v_item->'choices', v_item->'options', '[]'::jsonb);

    if v_kind not in ('multiple_choice', 'fill_blank')
      or pg_catalog.char_length(v_prompt) not between 3 and 600
      or pg_catalog.char_length(v_answer) not between 1 and 1000
      or pg_catalog.char_length(v_explanation) > 1000
      or pg_catalog.char_length(v_source_quote) > 1000
      or (v_kind = 'multiple_choice' and (
        pg_catalog.jsonb_typeof(v_choices) is distinct from 'array'
        or pg_catalog.jsonb_array_length(v_choices) not between 2 and 6
      )) then
      raise exception 'Invalid question structure' using errcode = '22023';
    end if;

    v_question_id := pg_catalog.gen_random_uuid();

    insert into public.questions (id, pack_id, artifact_id, owner_id, position, kind, prompt, choices)
    values (v_question_id, v_pack_id, v_artifact_id, v_owner, v_position, v_kind, v_prompt, v_choices);

    insert into private.question_keys (question_id, owner_id, answer, explanation, source_quote)
    values (v_question_id, v_owner, v_answer, v_explanation, v_source_quote);

    v_safe_questions := v_safe_questions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_question_id,
        'position', v_position,
        'kind', v_kind,
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

  update public.study_artifacts set status = 'ready', updated_at = pg_catalog.now()
  where id = v_artifact_id and owner_id = v_owner;

  return pg_catalog.jsonb_build_object(
    'id', v_pack_id,
    'packId', v_pack_id,
    'artifactId', v_artifact_id,
    'questions', v_safe_questions
  );
end;
$$;

create or replace function public.list_study_artifacts(p_pack_id uuid default null)
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
      'id', a.id,
      'packId', a.pack_id,
      'ownerId', a.owner_id,
      'kind', a.kind,
      'origin', a.origin,
      'status', a.status,
      'title', a.title,
      'version', a.version,
      'createdAt', a.created_at,
      'updatedAt', a.updated_at
    ) order by a.created_at desc
  ), '[]'::jsonb) into v_results
  from public.study_artifacts a
  where a.owner_id = v_uid
    and (p_pack_id is null or a.pack_id = p_pack_id);

  return v_results;
end;
$$;

revoke all on function public.list_study_artifacts(uuid) from public, anon;
grant execute on function public.list_study_artifacts(uuid) to authenticated, service_role;

create or replace function private.grade_study_answer(p_pack_id uuid, p_question_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_key private.question_keys%rowtype;
  v_resolved_pack_id uuid;
begin
  if v_owner is null then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;

  -- Resolve pack whether p_pack_id is a study_pack id or a study_artifact id
  select coalesce(
    (select p.id from public.study_packs p where p.id = p_pack_id and p.owner_id = v_owner and p.status = 'ready'),
    (select a.pack_id from public.study_artifacts a where a.id = p_pack_id and a.owner_id = v_owner and a.status = 'ready')
  ) into v_resolved_pack_id;

  if v_resolved_pack_id is null then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;

  if p_answer is null or pg_catalog.char_length(pg_catalog.btrim(p_answer)) not between 1 and 1000 then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;

  select answer_key.* into v_key
  from private.question_keys as answer_key
  join public.questions as question on question.id = answer_key.question_id
  where question.id = p_question_id
    and question.pack_id = v_resolved_pack_id
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
  p_client_attempt_id uuid default null,
  p_request_hash text default null
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
  v_existing_pack_id uuid;
  v_existing_hash text;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_client_attempt_id is null then
    raise exception 'client_attempt_id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.study_packs
    where id = p_pack_id
      and owner_id = v_owner
      and status = 'ready'
      and archived_at is null
  ) then
    raise exception 'StudyPack not found or archived' using errcode = '42501';
  end if;

  select s.id, s.pack_id, s.completed_at, s.score, s.correct_count, s.question_count, s.request_hash
  into v_attempt_id, v_existing_pack_id, v_completed_at, v_existing_score, v_correct_count, v_question_count, v_existing_hash
  from public.study_sessions as s
  where s.user_id = v_owner and s.client_attempt_id = p_client_attempt_id;

  if found then
    if v_existing_pack_id <> p_pack_id or (v_existing_hash is not null and p_request_hash is not null and v_existing_hash <> p_request_hash) then
      raise exception 'Attempt conflict: client attempt ID reused with different parameters' using errcode = '23505';
    end if;

    return pg_catalog.jsonb_build_object(
      'id', v_attempt_id,
      'packId', v_existing_pack_id,
      'score', v_existing_score,
      'correct', v_correct_count,
      'total', v_question_count,
      'completedAt', v_completed_at
    );
  end if;

  if pg_catalog.jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Invalid answers format' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer into v_question_count
  from public.questions
  where pack_id = p_pack_id and owner_id = v_owner;

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

  begin
    insert into public.study_sessions (
      user_id,
      pack_id,
      client_attempt_id,
      request_hash,
      score,
      correct_count,
      question_count
    )
    values (
      v_owner,
      p_pack_id,
      p_client_attempt_id,
      p_request_hash,
      pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer,
      v_correct_count,
      v_question_count
    )
    returning id, completed_at into v_attempt_id, v_completed_at;
  exception
    when unique_violation then
      select s.id, s.pack_id, s.completed_at, s.score, s.correct_count, s.question_count, s.request_hash
      into v_attempt_id, v_existing_pack_id, v_completed_at, v_existing_score, v_correct_count, v_question_count, v_existing_hash
      from public.study_sessions as s
      where s.user_id = v_owner and s.client_attempt_id = p_client_attempt_id;

      if found then
        if v_existing_pack_id <> p_pack_id or (v_existing_hash is not null and p_request_hash is not null and v_existing_hash <> p_request_hash) then
          raise exception 'Attempt conflict: client attempt ID reused with different parameters' using errcode = '23505';
        end if;

        return pg_catalog.jsonb_build_object(
          'id', v_attempt_id,
          'packId', v_existing_pack_id,
          'score', v_existing_score,
          'correct', v_correct_count,
          'total', v_question_count,
          'completedAt', v_completed_at
        );
      end if;
      raise;
  end;

  insert into public.study_session_answers (
    session_id,
    question_id,
    submitted_answer,
    is_correct,
    answered_at,
    ordinal
  )
  select
    v_attempt_id,
    (elem.val->>'question_id')::uuid,
    elem.val->>'answer',
    (pg_catalog.lower(pg_catalog.btrim(elem.val->>'answer')) = pg_catalog.lower(pg_catalog.btrim(answer_key.answer))),
    v_completed_at,
    coalesce(question.position, (elem.ord - 1)::integer)
  from pg_catalog.jsonb_array_elements(p_answers) with ordinality as elem(val, ord)
  join public.questions as question
    on question.id = (elem.val->>'question_id')::uuid and question.pack_id = p_pack_id and question.owner_id = v_owner
  join private.question_keys as answer_key
    on answer_key.question_id = question.id and answer_key.owner_id = v_owner;

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
  p_client_attempt_id uuid default null,
  p_request_hash text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.complete_study_attempt(p_pack_id, p_answers, p_client_attempt_id, p_request_hash); $$;

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

revoke all on function private.persist_study_pack(text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.grade_study_answer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.complete_study_attempt(uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function private.get_owned_study_source(uuid) from public, anon, authenticated;
revoke all on function private.consume_tutor_quota() from public, anon, authenticated;
revoke all on function private.read_tutor_conversation(uuid) from public, anon, authenticated;
revoke all on function private.list_tutor_conversations() from public, anon, authenticated;
revoke all on function private.save_tutor_exchange(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.persist_study_pack(text, text, text, text, text, jsonb, uuid) to postgres, service_role;
grant execute on function private.grade_study_answer(uuid, uuid, text) to authenticated;
grant execute on function private.complete_study_attempt(uuid, jsonb, uuid, text) to authenticated;
grant execute on function private.get_owned_study_source(uuid) to authenticated;
grant execute on function private.consume_tutor_quota() to authenticated;
grant execute on function private.read_tutor_conversation(uuid) to authenticated;
grant execute on function private.list_tutor_conversations() to authenticated;
grant execute on function private.save_tutor_exchange(uuid, uuid, text, text) to authenticated;

revoke all on function public.create_study_pack(text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.grade_study_answer(uuid, uuid, text) from public, anon;
revoke all on function public.complete_study_attempt(uuid, jsonb, uuid, text) from public, anon;
revoke all on function public.get_owned_study_source(uuid) from public, anon;
revoke all on function public.consume_tutor_quota() from public, anon;
revoke all on function public.read_tutor_conversation(uuid) from public, anon;
revoke all on function public.list_tutor_conversations() from public, anon;
revoke all on function public.save_tutor_exchange(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_study_pack(text, text, text, text, text, jsonb, uuid) to postgres, service_role;
grant execute on function public.grade_study_answer(uuid, uuid, text) to authenticated;
grant execute on function public.complete_study_attempt(uuid, jsonb, uuid, text) to authenticated;
grant execute on function public.get_owned_study_source(uuid) to authenticated;
grant execute on function public.consume_tutor_quota() to authenticated;
grant execute on function public.read_tutor_conversation(uuid) to authenticated;
grant execute on function public.list_tutor_conversations() to authenticated;
grant execute on function public.save_tutor_exchange(uuid, uuid, text, text) to authenticated;

-- Phase 2: Production Auth and Profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_raw_username text;
  v_username text;
  v_avatar_url text;
begin
  v_display_name := pg_catalog.substr(
    pg_catalog.btrim(
      coalesce(
        nullif(pg_catalog.btrim(new.raw_user_meta_data->>'display_name'), ''),
        nullif(pg_catalog.btrim(new.raw_user_meta_data->>'full_name'), ''),
        nullif(pg_catalog.btrim(new.raw_user_meta_data->>'name'), ''),
        nullif(pg_catalog.split_part(new.email, '@', 1), ''),
        'FETCH Student'::text
      )
    ), 1, 60
  );
  if pg_catalog.char_length(v_display_name) = 0 then
    v_display_name := 'FETCH Student';
  end if;

  v_raw_username := pg_catalog.lower(pg_catalog.btrim(coalesce(new.raw_user_meta_data->>'username', '')));
  if v_raw_username ~ '^[a-z0-9_]{3,24}$' then
    if not exists (select 1 from public.profiles where username = v_raw_username) then
      v_username := v_raw_username;
    else
      v_username := null;
    end if;
  else
    v_username := null;
  end if;

  v_avatar_url := coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture'
  );

  insert into public.profiles (id, display_name, username, avatar_url)
  values (new.id, v_display_name, v_username, v_avatar_url)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    insert into public.profiles (id, display_name, username)
    values (new.id, 'FETCH Student', null)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function private.ensure_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_profile record;
  v_display_name text;
  v_raw_username text;
  v_username text;
  v_avatar_url text;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if found then
    return pg_catalog.to_jsonb(v_profile);
  end if;

  select * into v_user from auth.users where id = p_user_id;
  if not found then
    return null;
  end if;

  v_display_name := pg_catalog.substr(
    pg_catalog.btrim(
      coalesce(
        nullif(pg_catalog.btrim(v_user.raw_user_meta_data->>'display_name'), ''),
        nullif(pg_catalog.btrim(v_user.raw_user_meta_data->>'full_name'), ''),
        nullif(pg_catalog.btrim(v_user.raw_user_meta_data->>'name'), ''),
        nullif(pg_catalog.split_part(v_user.email, '@', 1), ''),
        'FETCH Student'::text
      )
    ), 1, 60
  );
  if pg_catalog.char_length(v_display_name) = 0 then
    v_display_name := 'FETCH Student';
  end if;

  v_raw_username := pg_catalog.lower(pg_catalog.btrim(coalesce(v_user.raw_user_meta_data->>'username', '')));
  if v_raw_username ~ '^[a-z0-9_]{3,24}$' then
    if not exists (select 1 from public.profiles where username = v_raw_username) then
      v_username := v_raw_username;
    else
      v_username := null;
    end if;
  else
    v_username := null;
  end if;

  v_avatar_url := coalesce(
    v_user.raw_user_meta_data->>'avatar_url',
    v_user.raw_user_meta_data->>'picture'
  );

  begin
    insert into public.profiles (id, display_name, username, avatar_url)
    values (p_user_id, v_display_name, v_username, v_avatar_url)
    on conflict (id) do update set
      updated_at = pg_catalog.now()
    returning * into v_profile;
  exception
    when unique_violation then
      -- Fallback if username was concurrently claimed
      insert into public.profiles (id, display_name, username, avatar_url)
      values (p_user_id, v_display_name, null, v_avatar_url)
      on conflict (id) do update set
        updated_at = pg_catalog.now()
      returning * into v_profile;
  end;

  return pg_catalog.to_jsonb(v_profile);
end;
$$;

create or replace function public.ensure_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  return private.ensure_profile(v_user_id);
end;
$$;

create or replace function public.check_username_available(
  p_username text,
  p_current_user_id uuid default null
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select not exists (
    select 1 from public.profiles
    where username = pg_catalog.lower(pg_catalog.btrim(p_username))
      and (p_current_user_id is null or id <> p_current_user_id)
  );
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function private.ensure_profile(uuid) from public, anon, authenticated;
grant execute on function public.ensure_profile() to authenticated;
revoke all on function public.check_username_available(text, uuid) from public, anon;
grant execute on function public.check_username_available(text, uuid) to authenticated, anon;

-- Phase 5: Gemini Quota and Idempotency
create or replace function private.reserve_ai_generation(
  p_owner_id uuid,
  p_request_id uuid,
  p_payload_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_key text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_allowance integer := 15;
  v_override integer;
  v_req private.generation_requests%rowtype;
  v_usage private.monthly_ai_usage%rowtype;
  v_fencing_token bigint;
begin
  if p_owner_id is null or p_request_id is null or p_payload_hash is null then
    raise exception 'Invalid arguments' using errcode = '22023';
  end if;

  select * into v_req from private.generation_requests
  where owner_id = p_owner_id and request_id = p_request_id;

  if found then
    if v_req.state = 'committed' and v_req.pack_id is not null then
      return pg_catalog.jsonb_build_object(
        'status', 'committed',
        'packId', v_req.pack_id,
        'requestId', p_request_id
      );
    end if;

    if v_req.payload_hash <> p_payload_hash then
      raise exception 'Request ID conflict: payload does not match' using errcode = '23505';
    end if;

    if v_req.state = 'reserved' and v_req.updated_at > (now() - interval '3 minutes') then
      return pg_catalog.jsonb_build_object(
        'status', 'in_progress',
        'fencingToken', v_req.fencing_token,
        'requestId', p_request_id
      );
    end if;
  end if;

  select allowance into v_override
  from private.account_entitlement_overrides
  where owner_id = p_owner_id
    and now() >= effective_from
    and (effective_until is null or now() <= effective_until);

  if v_override is not null then
    v_allowance := v_override;
  end if;

  insert into private.monthly_ai_usage (owner_id, month_key, reserved_count, committed_count)
  values (p_owner_id, v_month_key, 0, 0)
  on conflict (owner_id, month_key) do nothing;

  select * into v_usage
  from private.monthly_ai_usage
  where owner_id = p_owner_id and month_key = v_month_key
  for update;

  update private.generation_requests
  set state = 'expired', updated_at = now()
  where owner_id = p_owner_id
    and utc_month_key = v_month_key
    and state = 'reserved'
    and updated_at < (now() - interval '5 minutes');

  if found then
    select count(*)::integer into v_usage.reserved_count
    from private.generation_requests
    where owner_id = p_owner_id and utc_month_key = v_month_key and state = 'reserved';

    update private.monthly_ai_usage
    set reserved_count = v_usage.reserved_count, updated_at = now()
    where owner_id = p_owner_id and month_key = v_month_key;
  end if;

  if (v_usage.committed_count + v_usage.reserved_count) >= v_allowance then
    raise exception 'Monthly AI StudyPack allowance reached (%/month)', v_allowance using errcode = '42901';
  end if;

  update private.monthly_ai_usage
  set reserved_count = reserved_count + 1, updated_at = now()
  where owner_id = p_owner_id and month_key = v_month_key;

  v_fencing_token := coalesce(v_req.fencing_token, 0) + 1;

  insert into private.generation_requests (
    owner_id, request_id, payload_hash, utc_month_key, state, fencing_token, updated_at
  )
  values (
    p_owner_id, p_request_id, p_payload_hash, v_month_key, 'reserved', v_fencing_token, now()
  )
  on conflict (owner_id, request_id) do update
  set payload_hash = excluded.payload_hash,
      utc_month_key = excluded.utc_month_key,
      state = 'reserved',
      fencing_token = v_fencing_token,
      updated_at = now();

  return pg_catalog.jsonb_build_object(
    'status', 'reserved',
    'fencingToken', v_fencing_token,
    'monthKey', v_month_key,
    'allowance', v_allowance,
    'remaining', greatest(0, v_allowance - (v_usage.committed_count + v_usage.reserved_count + 1))
  );
end;
$$;

create or replace function private.commit_ai_generation(
  p_owner_id uuid,
  p_request_id uuid,
  p_fencing_token bigint,
  p_pack_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req private.generation_requests%rowtype;
begin
  select * into v_req
  from private.generation_requests
  where owner_id = p_owner_id and request_id = p_request_id
  for update;

  if not found then
    raise exception 'Reservation not found' using errcode = '42501';
  end if;

  if v_req.state = 'committed' then
    return pg_catalog.jsonb_build_object('status', 'committed', 'packId', v_req.pack_id);
  end if;

  if v_req.state <> 'reserved' or v_req.fencing_token <> p_fencing_token then
    raise exception 'Stale reservation lease or invalid state' using errcode = '42501';
  end if;

  update private.generation_requests
  set state = 'committed', pack_id = p_pack_id, updated_at = now()
  where owner_id = p_owner_id and request_id = p_request_id;

  update private.monthly_ai_usage
  set reserved_count = greatest(0, reserved_count - 1),
      committed_count = committed_count + 1,
      updated_at = now()
  where owner_id = p_owner_id and month_key = v_req.utc_month_key;

  return pg_catalog.jsonb_build_object(
    'status', 'committed',
    'packId', p_pack_id
  );
end;
$$;

create or replace function private.release_ai_generation(
  p_owner_id uuid,
  p_request_id uuid,
  p_fencing_token bigint,
  p_failure_class text default 'unknown'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req private.generation_requests%rowtype;
begin
  select * into v_req
  from private.generation_requests
  where owner_id = p_owner_id and request_id = p_request_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'not_found');
  end if;

  if v_req.state = 'reserved' and v_req.fencing_token = p_fencing_token then
    update private.generation_requests
    set state = 'released', failure_class = p_failure_class, updated_at = now()
    where owner_id = p_owner_id and request_id = p_request_id;

    update private.monthly_ai_usage
    set reserved_count = greatest(0, reserved_count - 1),
        updated_at = now()
    where owner_id = p_owner_id and month_key = v_req.utc_month_key;
  end if;

  return pg_catalog.jsonb_build_object('status', 'released');
end;
$$;

create or replace function private.get_ai_usage(p_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_key text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_allowance integer := 15;
  v_override integer;
  v_committed integer := 0;
  v_reserved integer := 0;
begin
  if p_owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select allowance into v_override
  from private.account_entitlement_overrides
  where owner_id = p_owner_id
    and now() >= effective_from
    and (effective_until is null or now() <= effective_until);

  if v_override is not null then
    v_allowance := v_override;
  end if;

  select committed_count, reserved_count into v_committed, v_reserved
  from private.monthly_ai_usage
  where owner_id = p_owner_id and month_key = v_month_key;

  v_committed := coalesce(v_committed, 0);
  v_reserved := coalesce(v_reserved, 0);

  return pg_catalog.jsonb_build_object(
    'allowance', v_allowance,
    'used', v_committed,
    'reserved', v_reserved,
    'remaining', greatest(0, v_allowance - (v_committed + v_reserved)),
    'monthKey', v_month_key
  );
end;
$$;

create or replace function public.reserve_ai_generation(
  p_owner_id uuid,
  p_request_id uuid,
  p_payload_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.reserve_ai_generation(p_owner_id, p_request_id, p_payload_hash);
end;
$$;

revoke all on function public.reserve_ai_generation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_generation(uuid, uuid, text) to postgres, service_role;

create or replace function public.commit_ai_generation(
  p_owner_id uuid,
  p_request_id uuid,
  p_fencing_token bigint,
  p_pack_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.commit_ai_generation(p_owner_id, p_request_id, p_fencing_token, p_pack_id);
end;
$$;

revoke all on function public.commit_ai_generation(uuid, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.commit_ai_generation(uuid, uuid, bigint, uuid) to postgres, service_role;

create or replace function public.release_ai_generation(
  p_owner_id uuid,
  p_request_id uuid,
  p_fencing_token bigint,
  p_failure_class text default 'unknown'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.release_ai_generation(p_owner_id, p_request_id, p_fencing_token, p_failure_class);
end;
$$;

revoke all on function public.release_ai_generation(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.release_ai_generation(uuid, uuid, bigint, text) to postgres, service_role;

create or replace function public.get_ai_usage()
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
  return private.get_ai_usage(v_uid);
end;
$$;

revoke all on function private.reserve_ai_generation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.reserve_ai_generation(uuid, uuid, text) to postgres, service_role;

revoke all on function private.commit_ai_generation(uuid, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function private.commit_ai_generation(uuid, uuid, bigint, uuid) to postgres, service_role;

revoke all on function private.release_ai_generation(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function private.release_ai_generation(uuid, uuid, bigint, text) to postgres, service_role;

revoke all on function private.get_ai_usage(uuid) from public, anon, authenticated;
grant execute on function private.get_ai_usage(uuid) to postgres, service_role, authenticated;

revoke all on function public.get_ai_usage() from public, anon;
grant execute on function public.get_ai_usage() to authenticated, service_role;

-- Storage Bucket setup for study-sources
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-sources', 'study-sources', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

-- Storage RLS Policies
drop policy if exists "Users can upload their own source documents" on storage.objects;
create policy "Users can upload their own source documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'study-sources' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read their own source documents" on storage.objects;
create policy "Users can read their own source documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'study-sources' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own source documents" on storage.objects;
create policy "Users can delete their own source documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'study-sources' and
  (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.register_source_document(
  p_storage_path text,
  p_file_name text,
  p_file_size bigint,
  p_content_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into private.source_documents (
    owner_id, storage_path, file_name, file_size_bytes, content_hash, extraction_status
  )
  values (
    v_uid, p_storage_path, p_file_name, p_file_size, p_content_hash, 'pending'
  )
  returning id into v_doc_id;

  return pg_catalog.jsonb_build_object('id', v_doc_id, 'status', 'pending');
end;
$$;

revoke all on function public.register_source_document(text, text, bigint, text) from public, anon;
grant execute on function public.register_source_document(text, text, bigint, text) to authenticated, service_role;

create or replace function public.update_source_document(
  p_doc_id uuid,
  p_extraction_status text,
  p_extracted_text text default null,
  p_page_count integer default null,
  p_linked_pack_id uuid default null,
  p_failure_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.source_documents%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc from private.source_documents
  where id = p_doc_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Source document not found' using errcode = '42501';
  end if;

  update private.source_documents
  set extraction_status = p_extraction_status,
      extracted_text = coalesce(p_extracted_text, extracted_text),
      page_count = coalesce(p_page_count, page_count),
      linked_pack_id = coalesce(p_linked_pack_id, linked_pack_id),
      failure_reason = coalesce(p_failure_reason, failure_reason),
      updated_at = now()
  where id = p_doc_id;

  return pg_catalog.jsonb_build_object('id', p_doc_id, 'status', p_extraction_status);
end;
$$;

revoke all on function public.update_source_document(uuid, text, text, integer, uuid, text) from public, anon;
grant execute on function public.update_source_document(uuid, text, text, integer, uuid, text) to authenticated, service_role;

create or replace function public.get_source_document(p_doc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.source_documents%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc from private.source_documents
  where id = p_doc_id and owner_id = v_uid;

  if not found then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_doc.id,
    'fileName', v_doc.file_name,
    'extractedText', v_doc.extracted_text,
    'pageCount', v_doc.page_count,
    'contentHash', v_doc.content_hash,
    'status', v_doc.extraction_status,
    'linkedPackId', v_doc.linked_pack_id
  );
end;
$$;

revoke all on function public.get_source_document(uuid) from public, anon;
grant execute on function public.get_source_document(uuid) to authenticated, service_role;

-- Canonical friendships table
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

  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'Recipient user does not exist' using errcode = '42501';
  end if;

  select * into v_friendship from public.friendships
  where user_a = least(v_uid, p_recipient_id) and user_b = greatest(v_uid, p_recipient_id);

  if found then
    return pg_catalog.jsonb_build_object('status', 'already_friends');
  end if;

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

-- ---------------------------------------------------------------------------
-- Phase 10: Persistent Direct Messages & Realtime
-- ---------------------------------------------------------------------------
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

alter table public.messages add column if not exists client_message_id text;

create unique index if not exists messages_conversation_client_id_idx
  on public.messages(conversation_id, client_message_id)
  where client_message_id is not null;

create index if not exists messages_conversation_created_asc_idx
  on public.messages(conversation_id, created_at asc);

create index if not exists messages_conversation_created_desc_idx
  on public.messages(conversation_id, created_at desc);

revoke insert, update, delete on public.conversation_members from authenticated, anon;

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

  v_user_a := least(v_caller, p_participant_id);
  v_user_b := greatest(v_caller, p_participant_id);

  if not exists (
    select 1 from public.friendships
    where user_a = v_user_a and user_b = v_user_b
  ) then
    raise exception 'You can only message friends.';
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
grant execute on function public.list_user_conversations() to authenticated, service_role;

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

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = v_caller
  ) then
    raise exception 'Not authorized to send messages to this conversation.';
  end if;

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

  insert into public.messages (conversation_id, sender_id, body, client_message_id)
  values (p_conversation_id, v_caller, trim(p_body), p_client_message_id)
  returning id, conversation_id, sender_id, body, created_at, client_message_id
  into v_msg;

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
grant execute on function public.send_direct_message(uuid, text, text) to authenticated, service_role;

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
grant execute on function public.list_direct_messages(uuid, int, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Phase 11: Live Competition & Synchronized Server Scoring
-- ---------------------------------------------------------------------------
alter table public.live_rooms add column if not exists current_question_index int not null default 0;
alter table public.live_rooms add column if not exists question_count int not null default 0;
alter table public.live_rooms add column if not exists version int not null default 1;
alter table public.live_rooms add column if not exists expires_at timestamptz not null default (now() + interval '2 hours');
alter table public.live_rooms add column if not exists completed_at timestamptz default null;

create table if not exists public.live_room_members (
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  score int not null default 0,
  primary key (room_id, user_id)
);

create index if not exists live_room_members_user_idx on public.live_room_members(user_id);

create table if not exists private.live_room_questions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  question_index int not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_option_index int not null default 0,
  explanation text,
  unique (room_id, question_index)
);

create table if not exists public.live_room_answers (
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_index int not null,
  selected_index int not null,
  is_correct boolean not null,
  points_awarded int not null default 0,
  answered_at timestamptz not null default now(),
  primary key (room_id, user_id, question_index)
);

alter table public.live_room_members enable row level security;
alter table private.live_room_questions enable row level security;
alter table public.live_room_answers enable row level security;

drop policy if exists "rooms_read_members" on public.live_rooms;
drop policy if exists "members_read_members" on public.live_room_members;
drop policy if exists "answers_read_members" on public.live_room_answers;

create policy "rooms_read_members" on public.live_rooms
  for select to authenticated
  using (
    host_id = (select auth.uid()) or
    id in (select room_id from public.live_room_members where user_id = (select auth.uid()))
  );

create policy "members_read_members" on public.live_room_members
  for select to authenticated
  using (
    room_id in (
      select id from public.live_rooms where host_id = (select auth.uid())
      union
      select room_id from public.live_room_members where user_id = (select auth.uid())
    )
  );

create policy "answers_read_members" on public.live_room_answers
  for select to authenticated
  using (
    user_id = (select auth.uid()) or
    room_id in (select id from public.live_rooms where host_id = (select auth.uid()))
  );

revoke insert, update, delete on public.live_rooms from authenticated, anon;
revoke insert, update, delete on public.live_room_members from authenticated, anon;
revoke insert, update, delete on public.live_room_answers from authenticated, anon;
revoke all on private.live_room_questions from authenticated, anon;

grant select on public.live_room_members, public.live_room_answers to authenticated, service_role;

create or replace function public.create_live_room(p_pack_id uuid)
returns jsonb
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

  select count(*) into v_q_count from public.questions where pack_id = p_pack_id;
  if v_q_count = 0 then
    raise exception 'Cannot create a live room for a study pack with no questions.';
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
    host_id, pack_id, join_code, status, question_count, current_question_index, version
  ) values (
    v_caller, p_pack_id, v_join_code, 'lobby', v_q_count, 0, 1
  ) returning id into v_room_id;

  insert into public.live_room_members (room_id, user_id, score)
  values (v_room_id, v_caller, 0);

  for v_q in
    select q.id, q.prompt, coalesce(q.choices, '[]'::jsonb) as choices, qk.answer, qk.explanation
    from public.questions q
    left join private.question_keys qk on qk.question_id = q.id
    where q.pack_id = p_pack_id
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
    'status', 'lobby',
    'questionCount', v_q_count
  );
end;
$$;

revoke execute on function public.create_live_room(uuid) from public;
grant execute on function public.create_live_room(uuid) to authenticated, service_role;

create or replace function public.join_live_room(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select id, host_id, pack_id, status, expires_at into v_room
  from public.live_rooms
  where join_code = upper(trim(p_join_code));

  if v_room.id is null then
    raise exception 'Room not found with that code.';
  end if;

  if v_room.expires_at < now() then
    raise exception 'This live room has expired.';
  end if;

  if v_room.status = 'complete' then
    raise exception 'This live competition has already finished.';
  end if;

  insert into public.live_room_members (room_id, user_id, score)
  values (v_room.id, v_caller, 0)
  on conflict (room_id, user_id) do nothing;

  return jsonb_build_object(
    'roomId', v_room.id,
    'status', v_room.status,
    'packId', v_room.pack_id
  );
end;
$$;

revoke execute on function public.join_live_room(text) from public;
grant execute on function public.join_live_room(text) to authenticated, service_role;

create or replace function public.start_live_game(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> v_caller then
    raise exception 'Only the room host can start the game.';
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'Game has already started or ended.';
  end if;

  update public.live_rooms
  set status = 'active',
      current_question_index = 0,
      version = version + 1
  where id = p_room_id;

  return jsonb_build_object('success', true, 'status', 'active');
end;
$$;

revoke execute on function public.start_live_game(uuid) from public;
grant execute on function public.start_live_game(uuid) to authenticated, service_role;

create or replace function public.submit_live_answer(
  p_room_id uuid,
  p_question_index int,
  p_selected_index int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
  v_q record;
  v_is_correct boolean;
  v_points int := 0;
  v_new_score int;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found.';
  end if;

  if v_room.status <> 'active' then
    raise exception 'Room is not currently accepting answers.';
  end if;

  if v_room.current_question_index <> p_question_index then
    raise exception 'Answer submitted for inactive question.';
  end if;

  if not exists (
    select 1 from public.live_room_members where room_id = p_room_id and user_id = v_caller
  ) then
    raise exception 'You are not a participant in this room.';
  end if;

  if exists (
    select 1 from public.live_room_answers
    where room_id = p_room_id and user_id = v_caller and question_index = p_question_index
  ) then
    raise exception 'You have already answered this question.';
  end if;

  select * into v_q
  from private.live_room_questions
  where room_id = p_room_id and question_index = p_question_index;

  if v_q.id is null then
    raise exception 'Question not found.';
  end if;

  v_is_correct := (p_selected_index = v_q.correct_option_index);
  if v_is_correct then
    v_points := 100;
  end if;

  insert into public.live_room_answers (
    room_id, user_id, question_index, selected_index, is_correct, points_awarded
  ) values (
    p_room_id, v_caller, p_question_index, p_selected_index, v_is_correct, v_points
  );

  update public.live_room_members
  set score = score + v_points
  where room_id = p_room_id and user_id = v_caller
  returning score into v_new_score;

  return jsonb_build_object(
    'isCorrect', v_is_correct,
    'correctIndex', v_q.correct_option_index,
    'pointsAwarded', v_points,
    'currentScore', v_new_score,
    'explanation', v_q.explanation
  );
end;
$$;

revoke execute on function public.submit_live_answer(uuid, int, int) from public;
grant execute on function public.submit_live_answer(uuid, int, int) to authenticated, service_role;

create or replace function public.advance_live_question(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
  v_next_idx int;
  v_new_status text;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> v_caller then
    raise exception 'Only the host can advance questions.';
  end if;

  if v_room.status <> 'active' then
    raise exception 'Cannot advance question when room is not active.';
  end if;

  v_next_idx := v_room.current_question_index + 1;
  if v_next_idx >= v_room.question_count then
    update public.live_rooms
    set status = 'complete',
        completed_at = now(),
        version = version + 1
    where id = p_room_id;
    v_new_status := 'complete';
  else
    update public.live_rooms
    set current_question_index = v_next_idx,
        version = version + 1
    where id = p_room_id;
    v_new_status := 'active';
  end if;

  return jsonb_build_object(
    'status', v_new_status,
    'currentQuestionIndex', v_next_idx
  );
end;
$$;

revoke execute on function public.advance_live_question(uuid) from public;
grant execute on function public.advance_live_question(uuid) to authenticated, service_role;

create or replace function public.get_live_room_state(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
  v_pack_title text;
  v_members jsonb;
  v_question jsonb := null;
  v_my_answer record;
  v_q record;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> v_caller and not exists (
    select 1 from public.live_room_members where room_id = p_room_id and user_id = v_caller
  ) then
    raise exception 'Access denied: not a member of this room.';
  end if;

  select title into v_pack_title from public.study_packs where id = v_room.pack_id;

  select coalesce(jsonb_agg(m_obj order by m_obj.score desc, m_obj."joinedAt" asc), '[]'::jsonb)
  into v_members
  from (
    select
      rm.user_id as "userId",
      rm.score,
      rm.joined_at as "joinedAt",
      (rm.user_id = v_room.host_id) as "isHost",
      (rm.user_id = v_caller) as "isMe",
      coalesce(p.display_name, 'Study Buddy') as "displayName",
      p.username,
      p.avatar_url as "avatarUrl"
    from public.live_room_members rm
    join public.profiles p on p.id = rm.user_id
    where rm.room_id = p_room_id
  ) m_obj;

  if v_room.status = 'active' then
    select * into v_q
    from private.live_room_questions
    where room_id = p_room_id and question_index = v_room.current_question_index;

    if v_q.id is not null then
      select selected_index, is_correct, points_awarded into v_my_answer
      from public.live_room_answers
      where room_id = p_room_id and user_id = v_caller and question_index = v_room.current_question_index;

      v_question := jsonb_build_object(
        'index', v_q.question_index,
        'prompt', v_q.prompt,
        'options', v_q.options,
        'myAnswer', case
          when v_my_answer.selected_index is not null then
            jsonb_build_object(
              'selectedIndex', v_my_answer.selected_index,
              'isCorrect', v_my_answer.is_correct,
              'pointsAwarded', v_my_answer.points_awarded
            )
          else null
        end,
        'correctIndex', case
          when v_my_answer.selected_index is not null or v_room.host_id = v_caller then v_q.correct_option_index
          else null
        end,
        'explanation', case
          when v_my_answer.selected_index is not null or v_room.host_id = v_caller then v_q.explanation
          else null
        end
      );
    end if;
  end if;

  return jsonb_build_object(
    'roomId', v_room.id,
    'hostId', v_room.host_id,
    'isHost', (v_room.host_id = v_caller),
    'packId', v_room.pack_id,
    'packTitle', coalesce(v_pack_title, 'Study Pack'),
    'joinCode', v_room.join_code,
    'status', v_room.status,
    'currentQuestionIndex', v_room.current_question_index,
    'questionCount', v_room.question_count,
    'version', v_room.version,
    'members', v_members,
    'currentQuestion', v_question
  );
end;
$$;

revoke execute on function public.get_live_room_state(uuid) from public;
grant execute on function public.get_live_room_state(uuid) to authenticated, service_role;

-- ==============================================================================
-- Phase 12: Account Settings, Preferences, and Cascading Deletion Verification
-- ==============================================================================

create table if not exists private.account_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discoverable boolean not null default true,
  allow_direct_messages boolean not null default true,
  study_reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.account_preferences enable row level security;

create or replace function public.get_account_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_prefs from private.account_preferences where user_id = v_uid;
  if not found then
    insert into private.account_preferences (user_id, discoverable, allow_direct_messages, study_reminders)
    values (v_uid, true, true, true)
    on conflict (user_id) do nothing;

    select * into v_prefs from private.account_preferences where user_id = v_uid;
  end if;

  return jsonb_build_object(
    'discoverable', coalesce(v_prefs.discoverable, true),
    'allow_direct_messages', coalesce(v_prefs.allow_direct_messages, true),
    'study_reminders', coalesce(v_prefs.study_reminders, true)
  );
end;
$$;

create or replace function public.update_account_preferences(
  p_discoverable boolean default null,
  p_allow_direct_messages boolean default null,
  p_study_reminders boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into private.account_preferences (user_id, discoverable, allow_direct_messages, study_reminders, updated_at)
  values (
    v_uid,
    coalesce(p_discoverable, true),
    coalesce(p_allow_direct_messages, true),
    coalesce(p_study_reminders, true),
    now()
  )
  on conflict (user_id) do update set
    discoverable = coalesce(p_discoverable, private.account_preferences.discoverable),
    allow_direct_messages = coalesce(p_allow_direct_messages, private.account_preferences.allow_direct_messages),
    study_reminders = coalesce(p_study_reminders, private.account_preferences.study_reminders),
    updated_at = now()
  returning * into v_prefs;

  return jsonb_build_object(
    'discoverable', v_prefs.discoverable,
    'allow_direct_messages', v_prefs.allow_direct_messages,
    'study_reminders', v_prefs.study_reminders
  );
end;
$$;

revoke all on function public.get_account_preferences() from public;
grant execute on function public.get_account_preferences() to authenticated, service_role;

revoke all on function public.update_account_preferences(boolean, boolean, boolean) from public;
grant execute on function public.update_account_preferences(boolean, boolean, boolean) to authenticated, service_role;

-- ==============================================================================
-- Phase 13: Security, Performance, and Observability Hardening
-- ==============================================================================

create index if not exists idx_live_rooms_host_status on public.live_rooms(host_id, status);
create index if not exists idx_live_rooms_join_code on public.live_rooms(join_code);
create index if not exists idx_live_room_members_composite on public.live_room_members(room_id, user_id);
create index if not exists idx_live_room_questions_composite on private.live_room_questions(room_id, question_index);
create index if not exists idx_live_room_answers_composite on public.live_room_answers(room_id, question_index);
create index if not exists idx_friend_requests_composite on public.friend_requests(sender_id, recipient_id);
create index if not exists idx_calendar_events_user_starts on public.calendar_events(user_id, starts_at);

create or replace function public.cleanup_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drafts_count integer := 0;
  v_rooms_count integer := 0;
  v_stale_requests integer := 0;
begin
  with deleted_drafts as (
    delete from public.study_session_drafts
    where expires_at < now()
    returning id
  )
  select count(*) into v_drafts_count from deleted_drafts;

  with updated_rooms as (
    update public.live_rooms
    set status = 'finished'
    where status in ('waiting', 'active')
      and (expires_at < now() or created_at < now() - interval '24 hours')
    returning id
  )
  select count(*) into v_rooms_count from updated_rooms;

  with deleted_requests as (
    delete from public.friend_requests
    where status = 'pending'
      and created_at < now() - interval '30 days'
    returning id
  )
  select count(*) into v_stale_requests from deleted_requests;

  return jsonb_build_object(
    'cleanedDrafts', v_drafts_count,
    'closedRooms', v_rooms_count,
    'cleanedFriendRequests', v_stale_requests,
    'timestamp', now()
  );
end;
$$;

revoke all on function public.cleanup_expired_records() from public;
grant execute on function public.cleanup_expired_records() to authenticated, service_role;

-- ==============================================================================
-- Phase 14: Student Onboarding Preferences
-- ==============================================================================

create table if not exists private.student_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_subject text check (primary_subject is null or (char_length(trim(primary_subject)) > 0 and char_length(primary_subject) <= 100)),
  study_goal text check (study_goal is null or study_goal in ('exam', 'understand', 'habit')),
  focus_minutes integer not null default 25 check (focus_minutes in (15, 25, 45)),
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending', 'completed', 'skipped')),
  onboarding_version integer not null default 1,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.student_preferences enable row level security;

revoke all on table private.student_preferences from anon, authenticated, public;
grant all on table private.student_preferences to service_role;

create or replace function public.get_student_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is true then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_row from private.student_preferences where user_id = v_uid;
  if not found then
    return jsonb_build_object(
      'primarySubject', null,
      'studyGoal', null,
      'focusMinutes', 25,
      'onboardingStatus', 'pending',
      'onboardingVersion', 1,
      'completedAt', null
    );
  end if;

  return jsonb_build_object(
    'primarySubject', v_row.primary_subject,
    'studyGoal', v_row.study_goal,
    'focusMinutes', v_row.focus_minutes,
    'onboardingStatus', v_row.onboarding_status,
    'onboardingVersion', v_row.onboarding_version,
    'completedAt', v_row.completed_at
  );
end;
$$;

revoke all on function public.get_student_preferences() from public;
grant execute on function public.get_student_preferences() to authenticated, service_role;

create or replace function public.save_student_preferences(
  p_primary_subject text default null,
  p_study_goal text default null,
  p_focus_minutes integer default 25,
  p_action text default 'save'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_subj text;
  v_goal text;
  v_focus integer;
  v_row record;
  v_now timestamptz := now();
begin
  if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is true then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_action not in ('complete', 'skip', 'save') then
    raise exception 'Invalid action: %', p_action using errcode = '22023';
  end if;

  if v_action = 'skip' then
    v_subj := null;
    v_goal := null;
    v_focus := 25;
  else
    v_subj := nullif(trim(p_primary_subject), '');
    if v_subj is not null and char_length(v_subj) > 100 then
      raise exception 'Primary subject exceeds 100 characters' using errcode = '22023';
    end if;

    v_goal := nullif(trim(p_study_goal), '');
    if v_goal is not null and v_goal not in ('exam', 'understand', 'habit') then
      raise exception 'Invalid study goal: %', p_study_goal using errcode = '22023';
    end if;

    v_focus := coalesce(p_focus_minutes, 25);
    if v_focus not in (15, 25, 45) then
      raise exception 'Invalid focus minutes: %', p_focus_minutes using errcode = '22023';
    end if;
  end if;

  select * into v_row from private.student_preferences where user_id = v_uid for update;

  if found then
    if v_row.onboarding_status in ('completed', 'skipped') and v_action in ('complete', 'skip') then
      return jsonb_build_object(
        'primarySubject', v_row.primary_subject,
        'studyGoal', v_row.study_goal,
        'focusMinutes', v_row.focus_minutes,
        'onboardingStatus', v_row.onboarding_status,
        'onboardingVersion', v_row.onboarding_version,
        'completedAt', v_row.completed_at
      );
    end if;

    if v_action = 'complete' then
      update private.student_preferences
      set primary_subject = v_subj,
          study_goal = v_goal,
          focus_minutes = v_focus,
          onboarding_status = 'completed',
          completed_at = coalesce(v_row.completed_at, v_now),
          updated_at = v_now
      where user_id = v_uid
      returning * into v_row;
    elsif v_action = 'skip' then
      update private.student_preferences
      set primary_subject = null,
          study_goal = null,
          focus_minutes = 25,
          onboarding_status = 'skipped',
          completed_at = null,
          updated_at = v_now
      where user_id = v_uid
      returning * into v_row;
    else
      update private.student_preferences
      set primary_subject = v_subj,
          study_goal = v_goal,
          focus_minutes = v_focus,
          updated_at = v_now
      where user_id = v_uid
      returning * into v_row;
    end if;
  else
    if v_action = 'complete' then
      insert into private.student_preferences (
        user_id, primary_subject, study_goal, focus_minutes, onboarding_status, onboarding_version, completed_at, created_at, updated_at
      ) values (
        v_uid, v_subj, v_goal, v_focus, 'completed', 1, v_now, v_now, v_now
      ) returning * into v_row;
    elsif v_action = 'skip' then
      insert into private.student_preferences (
        user_id, primary_subject, study_goal, focus_minutes, onboarding_status, onboarding_version, completed_at, created_at, updated_at
      ) values (
        v_uid, null, null, 25, 'skipped', 1, null, v_now, v_now
      ) returning * into v_row;
    else
      insert into private.student_preferences (
        user_id, primary_subject, study_goal, focus_minutes, onboarding_status, onboarding_version, completed_at, created_at, updated_at
      ) values (
        v_uid, v_subj, v_goal, v_focus, 'pending', 1, null, v_now, v_now
      ) returning * into v_row;
    end if;
  end if;

  return jsonb_build_object(
    'primarySubject', v_row.primary_subject,
    'studyGoal', v_row.study_goal,
    'focusMinutes', v_row.focus_minutes,
    'onboardingStatus', v_row.onboarding_status,
    'onboardingVersion', v_row.onboarding_version,
    'completedAt', v_row.completed_at
  );
end;
$$;

revoke all on function public.save_student_preferences(text, text, integer, text) from public;
grant execute on function public.save_student_preferences(text, text, integer, text) to authenticated, service_role;

-- Phase 3: Durable Large Generation Pipeline & Summary Content
create table if not exists private.summary_content (
  artifact_id uuid primary key references public.study_artifacts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  schema_version integer not null default 1,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  source_references jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.summary_content enable row level security;
revoke all on private.summary_content from anon, authenticated, public;
grant all on private.summary_content to postgres, service_role;

create table if not exists private.generation_jobs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null,
  artifact_kind text not null check (artifact_kind in ('quiz', 'flashcards', 'summary')),
  title text not null check (char_length(title) between 1 and 120),
  source_type text not null check (source_type in ('text', 'pdf', 'url', 'manual')),
  source_label text not null check (char_length(source_label) between 1 and 120),
  requested_count integer not null check (requested_count between 3 and 50),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  stage text not null default 'queued' check (stage in ('queued', 'extracting', 'batching', 'grounding', 'finalizing', 'completed', 'failed', 'cancelled')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'failed', 'cancelled')),
  lease_owner text default null,
  fencing_token integer not null default 1,
  lease_expires_at timestamptz default null,
  cancel_requested boolean not null default false,
  failure_code text default null,
  failure_message text default null,
  pack_id uuid references public.study_packs(id) on delete set null,
  artifact_id uuid references public.study_artifacts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, request_id)
);

create index if not exists idx_generation_jobs_owner_status
  on private.generation_jobs(owner_id, status);

create index if not exists idx_generation_jobs_lease_expiry
  on private.generation_jobs(lease_expires_at)
  where status = 'in_progress';

alter table private.generation_jobs enable row level security;
revoke all on private.generation_jobs from anon, authenticated, public;
grant all on private.generation_jobs to postgres, service_role;

create table if not exists private.generation_job_inputs (
  job_id uuid primary key references private.generation_jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_content text not null,
  created_at timestamptz not null default now()
);

alter table private.generation_job_inputs enable row level security;
revoke all on private.generation_job_inputs from anon, authenticated, public;
grant all on private.generation_job_inputs to postgres, service_role;

create table if not exists private.generation_job_batches (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  job_id uuid not null references private.generation_jobs(id) on delete cascade,
  batch_number integer not null check (batch_number >= 0),
  allocated_count integer not null check (allocated_count > 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  accepted_questions jsonb default '[]'::jsonb,
  failure_code text default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, batch_number)
);

alter table private.generation_job_batches enable row level security;
revoke all on private.generation_job_batches from anon, authenticated, public;
grant all on private.generation_job_batches to postgres, service_role;

create or replace function private.start_generation_job(
  p_owner_id uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_artifact_kind text,
  p_title text,
  p_source_type text,
  p_source_label text,
  p_source_content text,
  p_requested_count integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job_id uuid;
  v_existing record;
  v_month_key text := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_used integer := 0;
  v_allowance integer := 15;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may start generation jobs' using errcode = '42501';
  end if;

  select id, status, payload_hash into v_existing
  from private.generation_jobs
  where owner_id = p_owner_id and request_id = p_request_id;

  if v_existing.id is not null then
    if v_existing.payload_hash = p_payload_hash then
      return jsonb_build_object(
        'jobId', v_existing.id,
        'status', v_existing.status,
        'reused', true
      );
    else
      raise exception 'Request ID conflict with different payload' using errcode = '23505';
    end if;
  end if;

  select count into v_used
  from private.monthly_ai_usage
  where user_id = p_owner_id and month_key = v_month_key;

  if coalesce(v_used, 0) >= v_allowance then
    raise exception 'Monthly AI StudyPack allowance reached' using errcode = '42901';
  end if;

  v_job_id := pg_catalog.gen_random_uuid();

  insert into private.generation_jobs (
    id, owner_id, request_id, payload_hash, artifact_kind,
    title, source_type, source_label, requested_count,
    stage, status
  ) values (
    v_job_id, p_owner_id, p_request_id, p_payload_hash, p_artifact_kind,
    pg_catalog.btrim(p_title), p_source_type, pg_catalog.btrim(p_source_label), p_requested_count,
    'queued', 'in_progress'
  );

  insert into private.generation_job_inputs (
    job_id, owner_id, source_content
  ) values (
    v_job_id, p_owner_id, p_source_content
  );

  return jsonb_build_object(
    'jobId', v_job_id,
    'status', 'in_progress',
    'stage', 'queued',
    'reused', false
  );
end;
$$;

revoke all on function private.start_generation_job(uuid, uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function private.start_generation_job(uuid, uuid, text, text, text, text, text, text, integer) to postgres, service_role;

create or replace function public.get_generation_job_status(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select
    id, owner_id, artifact_kind, requested_count, accepted_count,
    stage, status, cancel_requested, failure_code, failure_message,
    pack_id, artifact_id, created_at, updated_at
  into v_job
  from private.generation_jobs
  where id = p_job_id and owner_id = v_uid;

  if v_job.id is null then
    raise exception 'Job not found' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'jobId', v_job.id,
    'artifactKind', v_job.artifact_kind,
    'requestedCount', v_job.requested_count,
    'acceptedCount', v_job.accepted_count,
    'stage', v_job.stage,
    'status', v_job.status,
    'cancelRequested', v_job.cancel_requested,
    'failureCode', v_job.failure_code,
    'failureMessage', v_job.failure_message,
    'packId', v_job.pack_id,
    'artifactId', v_job.artifact_id,
    'createdAt', v_job.created_at,
    'updatedAt', v_job.updated_at
  );
end;
$$;

revoke all on function public.get_generation_job_status(uuid) from public, anon;
grant execute on function public.get_generation_job_status(uuid) to authenticated, service_role;

create or replace function public.request_cancel_generation_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select id, status into v_job
  from private.generation_jobs
  where id = p_job_id and owner_id = v_uid;

  if v_job.id is null then
    raise exception 'Job not found' using errcode = '42501';
  end if;

  if v_job.status = 'in_progress' then
    update private.generation_jobs
    set cancel_requested = true,
        updated_at = now()
    where id = p_job_id;
  end if;

  return jsonb_build_object(
    'jobId', p_job_id,
    'cancelRequested', true,
    'status', v_job.status
  );
end;
$$;

revoke all on function public.request_cancel_generation_job(uuid) from public, anon;
grant execute on function public.request_cancel_generation_job(uuid) to authenticated, service_role;

create or replace function private.atomic_finalize_generation_job(
  p_job_id uuid,
  p_questions jsonb default '[]'::jsonb,
  p_summary jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_pack_id uuid := pg_catalog.gen_random_uuid();
  v_artifact_id uuid := pg_catalog.gen_random_uuid();
  v_question_id uuid;
  v_item jsonb;
  v_position integer;
  v_kind text;
  v_prompt text;
  v_answer text;
  v_explanation text;
  v_source_quote text;
  v_choices jsonb;
  v_source_text text;
  v_month_key text := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_content_hash text;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may finalize generation jobs' using errcode = '42501';
  end if;

  select * into v_job
  from private.generation_jobs
  where id = p_job_id for update;

  if v_job.id is null then
    raise exception 'Job not found' using errcode = '42501';
  end if;

  if v_job.cancel_requested or v_job.status = 'cancelled' then
    update private.generation_jobs
    set status = 'cancelled', stage = 'cancelled', updated_at = now()
    where id = p_job_id;
    return jsonb_build_object('status', 'cancelled');
  end if;

  if v_job.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'packId', v_job.pack_id,
      'artifactId', v_job.artifact_id
    );
  end if;

  select source_content into v_source_text
  from private.generation_job_inputs
  where job_id = p_job_id;

  if v_source_text is null then
    v_source_text := 'Study source content';
  end if;

  v_content_hash := encode(digest(v_source_text, 'sha256'), 'hex');

  insert into public.study_packs (
    id, owner_id, title, source_type, source_label, status
  ) values (
    v_pack_id, v_job.owner_id, v_job.title, v_job.source_type, v_job.source_label, 'ready'
  );

  insert into public.study_artifacts (
    id, pack_id, owner_id, kind, origin, status, title, version
  ) values (
    v_artifact_id, v_pack_id, v_job.owner_id, v_job.artifact_kind, 'generated', 'ready', v_job.title, 1
  );

  if jsonb_typeof(p_questions) = 'array' and jsonb_array_length(p_questions) > 0 then
    for v_item, v_position in
      select item, (ordinality - 1)::integer
      from pg_catalog.jsonb_array_elements(p_questions) with ordinality as question(item, ordinality)
    loop
      v_kind := coalesce(v_item->>'kind', v_item->>'type', 'multiple_choice');
      v_prompt := pg_catalog.btrim(v_item->>'prompt');
      v_answer := pg_catalog.btrim(v_item->>'answer');
      v_explanation := coalesce(pg_catalog.btrim(v_item->>'explanation'), '');
      v_source_quote := coalesce(pg_catalog.btrim(v_item->>'sourceQuote'), '');
      v_choices := coalesce(v_item->'choices', v_item->'options', '[]'::jsonb);

      v_question_id := pg_catalog.gen_random_uuid();

      insert into public.questions (
        id, pack_id, artifact_id, owner_id, position, kind, prompt, choices
      ) values (
        v_question_id, v_pack_id, v_artifact_id, v_job.owner_id, v_position, v_kind, v_prompt, v_choices
      );

      insert into private.question_keys (
        question_id, owner_id, answer, explanation, source_quote
      ) values (
        v_question_id, v_job.owner_id, v_answer, v_explanation, v_source_quote
      );
    end loop;
  end if;

  if p_summary is not null and jsonb_typeof(p_summary) = 'object' then
    insert into private.summary_content (
      artifact_id, owner_id, content, source_references
    ) values (
      v_artifact_id, v_job.owner_id, p_summary, coalesce(p_summary->'references', '[]'::jsonb)
    );
  end if;

  insert into private.study_sources (
    pack_id, owner_id, content, content_hash
  ) values (
    v_pack_id, v_job.owner_id, v_source_text, v_content_hash
  );

  insert into private.monthly_ai_usage (
    user_id, month_key, count
  ) values (
    v_job.owner_id, v_month_key, 1
  )
  on conflict (user_id, month_key)
  do update set count = private.monthly_ai_usage.count + 1, updated_at = now();

  delete from private.generation_job_inputs where job_id = p_job_id;

  update private.generation_jobs
  set status = 'completed',
      stage = 'completed',
      accepted_count = coalesce(jsonb_array_length(p_questions), 0),
      pack_id = v_pack_id,
      artifact_id = v_artifact_id,
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'status', 'completed',
    'packId', v_pack_id,
    'artifactId', v_artifact_id,
    'acceptedCount', coalesce(jsonb_array_length(p_questions), 0)
  );
end;
$$;

revoke all on function private.atomic_finalize_generation_job(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.atomic_finalize_generation_job(uuid, jsonb, jsonb) to postgres, service_role;

create or replace function public.get_study_summary(p_artifact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_summary record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select content, source_references, updated_at
  into v_summary
  from private.summary_content
  where artifact_id = p_artifact_id and owner_id = v_uid;

  if v_summary.content is null then
    return null;
  end if;

  return jsonb_build_object(
    'artifactId', p_artifact_id,
    'content', v_summary.content,
    'sourceReferences', v_summary.source_references,
    'updatedAt', v_summary.updated_at
  );
end;
$$;

revoke all on function public.get_study_summary(uuid) from public, anon;
grant execute on function public.get_study_summary(uuid) to authenticated, service_role;

-- =========================================================================
-- Phase 4: Flashcards & Study Mastery
-- =========================================================================

create table if not exists public.flashcards (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  artifact_id uuid not null references public.study_artifacts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  front text not null check (char_length(pg_catalog.btrim(front)) >= 1),
  back text not null check (char_length(pg_catalog.btrim(back)) >= 1),
  aliases text[] not null default '{}'::text[],
  origin text not null default 'generated' check (origin in ('generated', 'manual')),
  source_quote text default null,
  source_chunk_ref text default null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_id, position)
);

create index if not exists idx_flashcards_artifact
  on public.flashcards(artifact_id, position);

create index if not exists idx_flashcards_owner
  on public.flashcards(owner_id);

alter table public.flashcards enable row level security;

create policy flashcards_owner_all
  on public.flashcards
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.flashcards to authenticated;
grant select, insert, update, delete on public.flashcards to service_role;

create table if not exists public.flashcard_sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.study_artifacts(id) on delete cascade,
  artifact_version integer not null default 1 check (artifact_version > 0),
  status text not null default 'active' check (status in ('active', 'incomplete', 'mastered')),
  client_session_id uuid not null,
  queue_state jsonb not null default '[]'::jsonb,
  first_try_correct integer not null default 0 check (first_try_correct >= 0),
  total_attempts integer not null default 0 check (total_attempts >= 0),
  cards_mastered integer not null default 0 check (cards_mastered >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_session_id)
);

create index if not exists idx_flashcard_sessions_owner_updated
  on public.flashcard_sessions(owner_id, updated_at desc);

create index if not exists idx_flashcard_sessions_artifact
  on public.flashcard_sessions(artifact_id);

alter table public.flashcard_sessions enable row level security;

create policy flashcard_sessions_owner_all
  on public.flashcard_sessions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.flashcard_sessions to authenticated;
grant select, insert, update, delete on public.flashcard_sessions to service_role;

create table if not exists public.flashcard_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_id uuid not null references public.flashcard_sessions(id) on delete cascade,
  card_id uuid not null references public.flashcards(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  submitted_answer text not null,
  is_correct boolean not null,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, ordinal)
);

create index if not exists idx_flashcard_attempts_session
  on public.flashcard_attempts(session_id, ordinal);

create index if not exists idx_flashcard_attempts_owner
  on public.flashcard_attempts(owner_id);

alter table public.flashcard_attempts enable row level security;

create policy flashcard_attempts_owner_all
  on public.flashcard_attempts
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.flashcard_attempts to authenticated;
grant select, insert, update, delete on public.flashcard_attempts to service_role;

-- Storage Bucket setup for study-scans
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-scans', 'study-scans', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png'];

-- Storage RLS Policies for study-scans
drop policy if exists "Users can upload their own scans" on storage.objects;
create policy "Users can upload their own scans"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'study-scans' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read their own scans" on storage.objects;
create policy "Users can read their own scans"
on storage.objects for select
to authenticated
using (
  bucket_id = 'study-scans' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own scans" on storage.objects;
create policy "Users can delete their own scans"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'study-scans' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Tables for scan documents and pages
create table if not exists private.scan_documents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'extracting', 'extracted', 'finalized', 'failed')),
  combined_text text not null default '',
  pack_id uuid references public.study_packs(id) on delete set null,
  page_count integer not null default 0 check (page_count >= 0 and page_count <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.scan_pages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  document_id uuid not null references private.scan_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0 and position < 5),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 5242880),
  dimensions jsonb default null,
  extracted_text text not null default '',
  quality_flag text not null default 'ok' check (quality_flag in ('ok', 'blurry', 'low_contrast', 'rotated', 'unreadable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, position)
);

create index if not exists idx_scan_documents_owner on private.scan_documents(owner_id, created_at desc);
create index if not exists idx_scan_documents_pack on private.scan_documents(pack_id) where pack_id is not null;
create index if not exists idx_scan_pages_doc_pos on private.scan_pages(document_id, position);
create index if not exists idx_scan_pages_owner on private.scan_pages(owner_id);

alter table private.scan_documents enable row level security;
alter table private.scan_pages enable row level security;

drop policy if exists scan_documents_owner_policy on private.scan_documents;
create policy scan_documents_owner_policy on private.scan_documents
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists scan_pages_owner_policy on private.scan_pages;
create policy scan_pages_owner_policy on private.scan_pages
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.create_scan_document()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into private.scan_documents (owner_id, status, combined_text, page_count)
  values (v_uid, 'draft', '', 0)
  returning id into v_doc_id;

  return pg_catalog.jsonb_build_object(
    'id', v_doc_id,
    'status', 'draft',
    'pageCount', 0
  );
end;
$$;

revoke all on function public.create_scan_document() from public, anon;
grant execute on function public.create_scan_document() to authenticated, service_role;

create or replace function public.register_scan_page(
  p_document_id uuid,
  p_position integer,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_dimensions jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.scan_documents%rowtype;
  v_page_id uuid;
  v_total_pages integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc
  from private.scan_documents
  where id = p_document_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  if p_position < 0 or p_position >= 5 then
    raise exception 'Page position must be between 0 and 4' using errcode = '22023';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png') then
    raise exception 'Unsupported image type. JPEG and PNG are supported.' using errcode = '22023';
  end if;

  if p_file_size <= 0 or p_file_size > 5242880 then
    raise exception 'Page image size exceeds 5 MiB limit' using errcode = '22023';
  end if;

  insert into private.scan_pages (
    document_id, owner_id, position, storage_path, mime_type, file_size_bytes, dimensions
  )
  values (
    p_document_id, v_uid, p_position, p_storage_path, p_mime_type, p_file_size, p_dimensions
  )
  on conflict (document_id, position) do update set
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    file_size_bytes = excluded.file_size_bytes,
    dimensions = excluded.dimensions,
    extracted_text = '',
    quality_flag = 'ok',
    updated_at = now()
  returning id into v_page_id;

  select count(*)::integer into v_total_pages
  from private.scan_pages
  where document_id = p_document_id;

  update private.scan_documents
  set page_count = v_total_pages, updated_at = now()
  where id = p_document_id;

  return pg_catalog.jsonb_build_object(
    'id', v_page_id,
    'documentId', p_document_id,
    'position', p_position,
    'pageCount', v_total_pages
  );
end;
$$;

revoke all on function public.register_scan_page(uuid, integer, text, text, bigint, jsonb) from public, anon;
grant execute on function public.register_scan_page(uuid, integer, text, text, bigint, jsonb) to authenticated, service_role;

create or replace function public.update_scan_page_text(
  p_page_id uuid,
  p_extracted_text text,
  p_quality_flag text default 'ok'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page private.scan_pages%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_page
  from private.scan_pages
  where id = p_page_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Scan page not found' using errcode = '42501';
  end if;

  update private.scan_pages
  set extracted_text = coalesce(p_extracted_text, ''),
      quality_flag = coalesce(p_quality_flag, 'ok'),
      updated_at = now()
  where id = p_page_id;

  return pg_catalog.jsonb_build_object(
    'id', p_page_id,
    'documentId', v_page.document_id,
    'position', v_page.position,
    'qualityFlag', coalesce(p_quality_flag, 'ok')
  );
end;
$$;

revoke all on function public.update_scan_page_text(uuid, text, text) from public, anon;
grant execute on function public.update_scan_page_text(uuid, text, text) to authenticated, service_role;

create or replace function public.update_scan_document_text(
  p_document_id uuid,
  p_combined_text text,
  p_status text default 'extracted',
  p_pack_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.scan_documents%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc
  from private.scan_documents
  where id = p_document_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  update private.scan_documents
  set combined_text = coalesce(p_combined_text, combined_text),
      status = coalesce(p_status, status),
      pack_id = coalesce(p_pack_id, pack_id),
      updated_at = now()
  where id = p_document_id;

  return pg_catalog.jsonb_build_object(
    'id', p_document_id,
    'status', coalesce(p_status, v_doc.status),
    'characterCount', length(coalesce(p_combined_text, v_doc.combined_text))
  );
end;
$$;

revoke all on function public.update_scan_document_text(uuid, text, text, uuid) from public, anon;
grant execute on function public.update_scan_document_text(uuid, text, text, uuid) to authenticated, service_role;

create or replace function public.get_scan_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.scan_documents%rowtype;
  v_pages jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc
  from private.scan_documents
  where id = p_document_id and owner_id = v_uid;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'position', p.position,
        'storagePath', p.storage_path,
        'mimeType', p.mime_type,
        'fileSizeBytes', p.file_size_bytes,
        'dimensions', p.dimensions,
        'extractedText', p.extracted_text,
        'qualityFlag', p.quality_flag,
        'createdAt', p.created_at
      ) order by p.position asc
    ),
    '[]'::jsonb
  ) into v_pages
  from private.scan_pages p
  where p.document_id = p_document_id;

  return pg_catalog.jsonb_build_object(
    'id', v_doc.id,
    'status', v_doc.status,
    'combinedText', v_doc.combined_text,
    'packId', v_doc.pack_id,
    'pageCount', v_doc.page_count,
    'pages', v_pages,
    'createdAt', v_doc.created_at,
    'updatedAt', v_doc.updated_at
  );
end;
$$;

revoke all on function public.get_scan_document(uuid) from public, anon;
grant execute on function public.get_scan_document(uuid) to authenticated, service_role;

create or replace function public.delete_scan_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_paths text[];
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select array_agg(storage_path) into v_paths
  from private.scan_pages
  where document_id = p_document_id and owner_id = v_uid;

  delete from private.scan_documents
  where id = p_document_id and owner_id = v_uid;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', p_document_id,
    'storagePaths', coalesce(v_paths, array[]::text[])
  );
end;
$$;

revoke all on function public.delete_scan_document(uuid) from public, anon;
grant execute on function public.delete_scan_document(uuid) to authenticated, service_role;

create or replace function public.reorder_scan_pages(
  p_document_id uuid,
  p_page_order uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.scan_documents%rowtype;
  v_page_count integer;
  i integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc
  from private.scan_documents
  where id = p_document_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  v_page_count := array_length(p_page_order, 1);
  if v_page_count is null or v_page_count > 5 then
    raise exception 'Invalid page count for reordering' using errcode = '22023';
  end if;

  -- Temporary offset to prevent unique constraint conflicts during swap
  update private.scan_pages
  set position = position + 100
  where document_id = p_document_id and owner_id = v_uid;

  for i in 1..v_page_count loop
    update private.scan_pages
    set position = i - 1, updated_at = now()
    where id = p_page_order[i] and document_id = p_document_id and owner_id = v_uid;
  end loop;

  return public.get_scan_document(p_document_id);
end;
$$;

revoke all on function public.reorder_scan_pages(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_scan_pages(uuid, uuid[]) to authenticated, service_role;



