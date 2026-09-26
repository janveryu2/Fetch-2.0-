-- Migration: 20260926040000_flashcards_mastery.sql
-- Description: Phase 4 - Flashcard decks (generated and manual), study sessions, attempt tracking, and mastery

-- 1. Create public.flashcards table
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

create policy flashcards_owner_select
  on public.flashcards
  for select
  using (owner_id = auth.uid());

create policy flashcards_owner_all
  on public.flashcards
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.flashcards to authenticated;
grant select, insert, update, delete on public.flashcards to service_role;

-- 2. Create public.flashcard_sessions table
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

-- 3. Create public.flashcard_attempts table
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

-- 4. RPC: create_manual_deck
create or replace function public.create_manual_deck(
  p_title text,
  p_cards jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pack_id uuid := pg_catalog.gen_random_uuid();
  v_artifact_id uuid := pg_catalog.gen_random_uuid();
  v_card jsonb;
  v_pos integer := 0;
  v_front text;
  v_back text;
  v_aliases text[];
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(pg_catalog.btrim(p_title)) < 1 then
    raise exception 'Title cannot be empty' using errcode = '22023';
  end if;

  -- 1. Create parent study pack with source_type='manual'
  insert into public.study_packs (
    id, owner_id, title, source_type, source_label, status
  ) values (
    v_pack_id, v_uid, pg_catalog.btrim(p_title), 'manual', 'Manual Deck', 'ready'
  );

  -- 2. Create flashcard artifact
  insert into public.study_artifacts (
    id, pack_id, owner_id, kind, origin, status, title, version
  ) values (
    v_artifact_id, v_pack_id, v_uid, 'flashcards', 'manual', 'ready', pg_catalog.btrim(p_title), 1
  );

  -- 3. Insert any initial cards
  if jsonb_typeof(p_cards) = 'array' and jsonb_array_length(p_cards) > 0 then
    for v_card in select * from pg_catalog.jsonb_array_elements(p_cards) loop
      v_front := pg_catalog.btrim(coalesce(v_card->>'front', ''));
      v_back := pg_catalog.btrim(coalesce(v_card->>'back', ''));

      if char_length(v_front) > 0 and char_length(v_back) > 0 then
        -- parse aliases array if present
        v_aliases := array[]::text[];
        if jsonb_typeof(v_card->'aliases') = 'array' then
          select coalesce(array_agg(elem::text), array[]::text[])
          into v_aliases
          from jsonb_array_elements_text(v_card->'aliases') as elem;
        end if;

        insert into public.flashcards (
          artifact_id, owner_id, position, front, back, aliases, origin, version
        ) values (
          v_artifact_id, v_uid, v_pos, v_front, v_back, v_aliases, 'manual', 1
        );
        v_pos := v_pos + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'packId', v_pack_id,
    'artifactId', v_artifact_id,
    'cardCount', v_pos
  );
end;
$$;

revoke all on function public.create_manual_deck(text, jsonb) from public, anon;
grant execute on function public.create_manual_deck(text, jsonb) to authenticated, service_role;

-- 5. RPC: list_flashcards
create or replace function public.list_flashcards(p_artifact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_artifact record;
  v_cards jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select id, owner_id, version into v_artifact
  from public.study_artifacts
  where id = p_artifact_id and owner_id = v_uid;

  if v_artifact.id is null then
    raise exception 'Artifact not found' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'position', f.position,
      'front', f.front,
      'back', f.back,
      'aliases', f.aliases,
      'origin', f.origin,
      'sourceQuote', f.source_quote,
      'version', f.version
    ) order by f.position asc
  ), '[]'::jsonb) into v_cards
  from public.flashcards f
  where f.artifact_id = p_artifact_id and f.owner_id = v_uid;

  return jsonb_build_object(
    'artifactId', p_artifact_id,
    'version', v_artifact.version,
    'cards', v_cards
  );
end;
$$;

revoke all on function public.list_flashcards(uuid) from public, anon;
grant execute on function public.list_flashcards(uuid) to authenticated, service_role;

-- 6. RPC: start_flashcard_session
create or replace function public.start_flashcard_session(
  p_artifact_id uuid,
  p_client_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_artifact record;
  v_existing record;
  v_session_id uuid;
  v_card_ids jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select id, owner_id, version into v_artifact
  from public.study_artifacts
  where id = p_artifact_id and owner_id = v_uid;

  if v_artifact.id is null then
    raise exception 'Artifact not found' using errcode = '42501';
  end if;

  -- Check existing session by client_session_id
  select id, status, queue_state, first_try_correct, cards_mastered, total_attempts
  into v_existing
  from public.flashcard_sessions
  where owner_id = v_uid and client_session_id = p_client_session_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'sessionId', v_existing.id,
      'status', v_existing.status,
      'queueState', v_existing.queue_state,
      'firstTryCorrect', v_existing.first_try_correct,
      'cardsMastered', v_existing.cards_mastered,
      'totalAttempts', v_existing.total_attempts,
      'reused', true
    );
  end if;

  -- Build initial queue from cards
  select coalesce(jsonb_agg(f.id order by f.position asc), '[]'::jsonb)
  into v_card_ids
  from public.flashcards f
  where f.artifact_id = p_artifact_id and f.owner_id = v_uid;

  v_session_id := pg_catalog.gen_random_uuid();

  insert into public.flashcard_sessions (
    id, owner_id, artifact_id, artifact_version, client_session_id, queue_state
  ) values (
    v_session_id, v_uid, p_artifact_id, v_artifact.version, p_client_session_id, v_card_ids
  );

  return jsonb_build_object(
    'sessionId', v_session_id,
    'status', 'active',
    'queueState', v_card_ids,
    'firstTryCorrect', 0,
    'cardsMastered', 0,
    'totalAttempts', 0,
    'reused', false
  );
end;
$$;

revoke all on function public.start_flashcard_session(uuid, uuid) from public, anon;
grant execute on function public.start_flashcard_session(uuid, uuid) to authenticated, service_role;

-- 7. Update private.atomic_finalize_generation_job to support flashcard artifacts
create or replace function private.atomic_finalize_generation_job(
  p_job_id uuid,
  p_questions jsonb default '[]'::jsonb,
  p_summary jsonb default null,
  p_flashcards jsonb default '[]'::jsonb
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
  v_card_id uuid;
  v_item jsonb;
  v_position integer;
  v_kind text;
  v_prompt text;
  v_answer text;
  v_explanation text;
  v_source_quote text;
  v_choices jsonb;
  v_front text;
  v_back text;
  v_aliases text[];
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

  -- Retrieve raw source text
  select source_content into v_source_text
  from private.generation_job_inputs
  where job_id = p_job_id;

  if v_source_text is null then
    v_source_text := 'Study source content';
  end if;

  v_content_hash := encode(digest(v_source_text, 'sha256'), 'hex');

  -- 1. Insert parent study pack
  insert into public.study_packs (
    id, owner_id, title, source_type, source_label, status
  ) values (
    v_pack_id, v_job.owner_id, v_job.title, v_job.source_type, v_job.source_label, 'ready'
  );

  -- 2. Insert primary artifact
  insert into public.study_artifacts (
    id, pack_id, owner_id, kind, origin, status, title, version
  ) values (
    v_artifact_id, v_pack_id, v_job.owner_id, v_job.artifact_kind, 'generated', 'ready', v_job.title, 1
  );

  -- 3. If quiz questions provided, insert questions and keys
  if jsonb_typeof(p_questions) = 'array' and jsonb_array_length(p_questions) > 0 then
    for v_item, v_position in
      select item, (ordinality - 1)::integer
      from pg_catalog.jsonb_array_elements(p_questions) with ordinality as question(item, ordinality)
    loop
      v_kind := coalesce(v_item->>'kind', v_item->>'type', 'multiple_choice');
      v_prompt := pg_catalog.btrim(v_item->>'prompt');
      v_answer := pg_catalog.btrim(v_item->>'answer');
      v_explanation := coalesce(v_item->>'explanation', '');
      v_source_quote := coalesce(v_item->>'sourceQuote', '');
      v_choices := coalesce(v_item->'choices', '[]'::jsonb);

      v_question_id := pg_catalog.gen_random_uuid();

      insert into public.questions (
        id, pack_id, artifact_id, owner_id, position, kind, prompt, choices
      ) values (
        v_question_id, v_pack_id, v_artifact_id, v_job.owner_id, v_position, v_kind, v_prompt, v_choices
      );

      insert into private.question_keys (
        question_id, pack_id, owner_id, answer, explanation, source_quote
      ) values (
        v_question_id, v_pack_id, v_job.owner_id, v_answer, v_explanation, v_source_quote
      );
    end loop;
  end if;

  -- 4. If structured summary provided, insert into private.summary_content
  if p_summary is not null and jsonb_typeof(p_summary) = 'object' then
    insert into private.summary_content (
      artifact_id, owner_id, schema_version, content
    ) values (
      v_artifact_id, v_job.owner_id, 1, p_summary
    );
  end if;

  -- 5. If flashcards provided, insert into public.flashcards
  if jsonb_typeof(p_flashcards) = 'array' and jsonb_array_length(p_flashcards) > 0 then
    for v_item, v_position in
      select item, (ordinality - 1)::integer
      from pg_catalog.jsonb_array_elements(p_flashcards) with ordinality as card(item, ordinality)
    loop
      v_front := pg_catalog.btrim(coalesce(v_item->>'front', ''));
      v_back := pg_catalog.btrim(coalesce(v_item->>'back', ''));
      v_source_quote := coalesce(v_item->>'sourceQuote', null);

      v_aliases := array[]::text[];
      if jsonb_typeof(v_item->'aliases') = 'array' then
        select coalesce(array_agg(elem::text), array[]::text[])
        into v_aliases
        from jsonb_array_elements_text(v_item->'aliases') as elem;
      end if;

      if char_length(v_front) > 0 and char_length(v_back) > 0 then
        insert into public.flashcards (
          artifact_id, owner_id, position, front, back, aliases, origin, source_quote, version
        ) values (
          v_artifact_id, v_job.owner_id, v_position, v_front, v_back, v_aliases, 'generated', v_source_quote, 1
        );
      end if;
    end loop;
  end if;

  -- 6. Link private source document
  insert into private.source_documents (
    pack_id, owner_id, source_type, source_content, content_hash, extraction_status
  ) values (
    v_pack_id, v_job.owner_id, v_job.source_type, v_source_text, v_content_hash, 'extracted'
  );

  -- 7. Atomically commit monthly AI quota usage
  insert into private.monthly_ai_usage (
    user_id, month_key, count, updated_at
  ) values (
    v_job.owner_id, v_month_key, 1, now()
  )
  on conflict (user_id, month_key) do update
    set count = private.monthly_ai_usage.count + 1,
        updated_at = now();

  -- 8. Mark job completed and link result IDs
  update private.generation_jobs
  set status = 'completed',
      stage = 'completed',
      pack_id = v_pack_id,
      artifact_id = v_artifact_id,
      accepted_count = case
        when jsonb_typeof(p_questions) = 'array' and jsonb_array_length(p_questions) > 0 then jsonb_array_length(p_questions)
        when jsonb_typeof(p_flashcards) = 'array' and jsonb_array_length(p_flashcards) > 0 then jsonb_array_length(p_flashcards)
        else 1
      end,
      updated_at = now()
  where id = p_job_id;

  -- 9. Purge raw input source text from private.generation_job_inputs
  delete from private.generation_job_inputs
  where job_id = p_job_id;

  return jsonb_build_object(
    'status', 'completed',
    'packId', v_pack_id,
    'artifactId', v_artifact_id
  );
end;
$$;

revoke all on function private.atomic_finalize_generation_job(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.atomic_finalize_generation_job(uuid, jsonb, jsonb, jsonb) to postgres, service_role;
