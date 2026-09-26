-- Migration: 20260926020000_study_artifacts_model.sql
-- Description: Phase 2 - Establish study_artifacts model, backfill existing packs, link questions, and update RPCs

-- 1. Extend study_packs source_type check constraint to permit 'manual'
alter table public.study_packs
  drop constraint if exists study_packs_source_type_check;

alter table public.study_packs
  add constraint study_packs_source_type_check
  check (source_type in ('text', 'pdf', 'url', 'manual'));

-- 2. Create public.study_artifacts table
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

-- 3. Indexes for study_artifacts
create index if not exists idx_study_artifacts_owner_pack_kind
  on public.study_artifacts(owner_id, pack_id, kind);

create index if not exists idx_study_artifacts_pack_created
  on public.study_artifacts(pack_id, created_at desc);

-- 4. Enable RLS on study_artifacts
alter table public.study_artifacts enable row level security;

revoke all on public.study_artifacts from anon, public;
grant select, insert, update, delete on public.study_artifacts to authenticated, service_role;

create policy "artifacts_read_owner" on public.study_artifacts
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "artifacts_insert_owner" on public.study_artifacts
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "artifacts_update_owner" on public.study_artifacts
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "artifacts_delete_owner" on public.study_artifacts
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- 5. Add nullable artifact_id column to public.questions
alter table public.questions
  add column if not exists artifact_id uuid references public.study_artifacts(id) on delete cascade;

-- 6. Backfill one legacy 'quiz' artifact for every existing study pack
insert into public.study_artifacts (id, pack_id, owner_id, kind, origin, status, title, version, created_at, updated_at)
select
  p.id as id, -- Reuse pack_id as artifact_id for 1:1 legacy quiz compatibility
  p.id as pack_id,
  p.owner_id,
  'quiz' as kind,
  'generated' as origin,
  p.status,
  p.title,
  1 as version,
  p.created_at,
  p.updated_at
from public.study_packs p
where not exists (
  select 1 from public.study_artifacts a where a.pack_id = p.id and a.kind = 'quiz'
);

-- 7. Backfill questions.artifact_id from the newly created quiz artifacts
update public.questions q
set artifact_id = a.id
from public.study_artifacts a
where q.pack_id = a.pack_id and a.kind = 'quiz' and q.artifact_id is null;

-- Unique constraint / index on (artifact_id, position) for questions
create unique index if not exists idx_questions_artifact_position
  on public.questions(artifact_id, position)
  where artifact_id is not null;

-- 8. Add nullable artifact_id to study_sessions and backfill
alter table public.study_sessions
  add column if not exists artifact_id uuid references public.study_artifacts(id) on delete set null;

update public.study_sessions s
set artifact_id = a.id
from public.study_artifacts a
where s.pack_id = a.pack_id and a.kind = 'quiz' and s.artifact_id is null;

create index if not exists idx_study_sessions_artifact_id
  on public.study_sessions(artifact_id)
  where artifact_id is not null;

-- 9. Add nullable artifact_id to study_session_drafts
alter table public.study_session_drafts
  add column if not exists artifact_id uuid references public.study_artifacts(id) on delete set null;

update public.study_session_drafts d
set artifact_id = a.id
from public.study_artifacts a
where d.pack_id = a.pack_id and a.kind = 'quiz' and d.artifact_id is null;

-- 10. Update private.persist_study_pack to create both study_pack and study_artifact
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

-- 11. RPC: List Study Artifacts
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

-- 12. Update private.grade_study_answer to resolve pack_id whether passed as pack_id or artifact_id
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
