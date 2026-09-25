-- Migration: 20260925120000_secure_schema_foundation.sql
-- Phase 1: Secure schema foundation, quota/usage tables, session answers/drafts, and policy tightening

-- 1. Phase 1 Foundation Tables

create table if not exists private.generation_requests (
  id uuid primary key default gen_random_uuid(),
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

create table if not exists public.study_session_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  submitted_answer text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  ordinal integer not null,
  unique (session_id, question_id)
);

create table if not exists public.study_session_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references public.study_packs(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  current_position integer not null default 0,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, pack_id)
);

create table if not exists private.source_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_size_bytes bigint not null,
  content_hash text not null,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'extracted', 'failed')),
  linked_pack_id uuid references public.study_packs(id) on delete set null,
  cleanup_state text not null default 'retained' check (cleanup_state in ('retained', 'cleaned', 'failed')),
  created_at timestamptz not null default now()
);

-- 2. Indexes

create index if not exists generation_requests_owner_month_idx on private.generation_requests(owner_id, utc_month_key);
create index if not exists study_session_answers_session_idx on public.study_session_answers(session_id);
create index if not exists study_session_drafts_user_pack_idx on public.study_session_drafts(user_id, pack_id);
create index if not exists source_documents_owner_idx on private.source_documents(owner_id);

-- 3. Row Level Security & Grants for New Tables

alter table private.generation_requests enable row level security;
alter table private.monthly_ai_usage enable row level security;
alter table public.study_session_answers enable row level security;
alter table public.study_session_drafts enable row level security;
alter table private.source_documents enable row level security;

revoke all on private.generation_requests from public, anon, authenticated;
revoke all on private.monthly_ai_usage from public, anon, authenticated;
revoke all on private.source_documents from public, anon, authenticated;
revoke all on public.study_session_answers from public, anon, authenticated;
revoke all on public.study_session_drafts from public, anon, authenticated;

grant select on public.study_session_answers to authenticated;
grant select, insert, update, delete on public.study_session_drafts to authenticated;

drop policy if exists "answers_read_session_owner" on public.study_session_answers;
create policy "answers_read_session_owner" on public.study_session_answers
  for select to authenticated
  using (exists (
    select 1 from public.study_sessions as session
    where session.id = session_id and session.user_id = (select auth.uid())
  ));

drop policy if exists "drafts_owner_all" on public.study_session_drafts;
create policy "drafts_owner_all" on public.study_session_drafts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 4. Tighten Existing Permissive Social & Room Policies

-- Tighten profiles: read self only via direct query
drop policy if exists "profiles_read_authenticated" on public.profiles;
drop policy if exists "profiles_read_self" on public.profiles;
create policy "profiles_read_self" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- Tighten live rooms: read only rooms hosted by user until membership model in Phase 11
drop policy if exists "rooms_read_authenticated" on public.live_rooms;
drop policy if exists "rooms_read_host" on public.live_rooms;
create policy "rooms_read_host" on public.live_rooms
  for select to authenticated
  using ((select auth.uid()) = host_id);

-- Restrict direct conversation self-join and arbitrary creation until direct pair RPC in Phase 10
drop policy if exists "members_join_self" on public.conversation_members;
drop policy if exists "conversations_create" on public.conversations;

-- 5. Revoke Direct StudyPack Creation RPC from Authenticated / Anon / Public
-- Direct client calls to create_study_pack cannot bypass quota or AI validation
revoke execute on function public.create_study_pack(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function private.persist_study_pack(text, text, text, text, text, jsonb) from public, anon, authenticated;

-- Replace with owner-aware functions for trusted server execution
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
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), pg_catalog.current_user);
  v_auth_uid uuid := (select auth.uid());
  v_owner uuid;
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
  if p_owner_id is not null then
    if v_caller_role is distinct from 'service_role' and pg_catalog.current_user not in ('postgres', 'supabase_admin') then
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

create or replace function public.create_study_pack(
  p_title text,
  p_source_type text,
  p_source_label text,
  p_source_content text,
  p_content_hash text,
  p_questions jsonb,
  p_owner_id uuid default null
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.persist_study_pack(p_title, p_source_type, p_source_label, p_source_content, p_content_hash, p_questions, p_owner_id);
$$;

revoke all on function public.create_study_pack(text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_study_pack(text, text, text, text, text, jsonb, uuid) to postgres, service_role;

revoke all on function private.persist_study_pack(text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function private.persist_study_pack(text, text, text, text, text, jsonb, uuid) to postgres, service_role;
