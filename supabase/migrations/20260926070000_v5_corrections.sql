-- Migration: 20260926070000_v5_corrections.sql
-- Description: Comprehensive V5 Architecture Corrections (B1, B2, B3, I3-I6, I8, I10, I11, I15)

-- ============================================================================
-- 1. Drop obsolete overloads and retired functions
-- ============================================================================
drop function if exists private.atomic_finalize_generation_job(uuid, uuid, text, text);
drop function if exists public.create_live_room(uuid);

-- ============================================================================
-- 2. Schema extensions: quiz subtypes and identification questions
-- ============================================================================
alter table public.study_artifacts
  add column if not exists subtype text default null
  check (subtype is null or subtype in ('multiple_choice', 'fill_blank', 'identification', 'mixed'));

alter table public.questions
  drop constraint if exists questions_kind_check;

alter table public.questions
  add constraint questions_kind_check
  check (kind in ('multiple_choice', 'fill_blank', 'identification'));

-- ============================================================================
-- 3. Scan Reordering Deferrable Constraint & Fixed RPC (I8)
-- ============================================================================
alter table private.scan_pages
  drop constraint if exists scan_pages_document_id_position_key;

alter table private.scan_pages
  add constraint scan_pages_document_id_position_key
  unique (document_id, position) deferrable initially deferred;

create or replace function public.reorder_scan_pages(
  p_document_id uuid,
  p_page_order uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_page_count integer;
  v_doc record;
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

  -- With deferrable unique constraint, positions 0..n-1 can be updated directly without out-of-bounds offset
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

-- ============================================================================
-- 4. Repaired private.atomic_finalize_generation_job (B2, B1)
-- ============================================================================
create or replace function private.atomic_finalize_generation_job(
  p_job_id uuid,
  p_questions jsonb default '[]'::jsonb,
  p_summary jsonb default null,
  p_flashcards jsonb default '[]'::jsonb,
  p_parent_pack_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_pack_id uuid;
  v_artifact_id uuid := pg_catalog.gen_random_uuid();
  v_source_text text;
  v_content_hash text;
  v_month_key text := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_question_id uuid;
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
  v_used integer := 0;
  v_allowance integer := 15;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may finalize generation jobs' using errcode = '42501';
  end if;

  -- 1. Fetch and row-lock the generation job
  select * into v_job
  from private.generation_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Generation job not found' using errcode = 'P0002';
  end if;

  if v_job.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'packId', v_job.pack_id,
      'artifactId', v_job.artifact_id,
      'reused', true
    );
  end if;

  if v_job.status in ('failed', 'cancelled') then
    raise exception 'Cannot finalize a % job', v_job.status using errcode = '22000';
  end if;

  -- 2. Fetch raw source content
  select source_content into v_source_text
  from private.generation_job_inputs
  where job_id = p_job_id;

  if v_source_text is null or char_length(v_source_text) = 0 then
    v_source_text := v_job.title;
  end if;

  -- Qualified extensions.digest under SET search_path = ''
  v_content_hash := encode(extensions.digest(v_source_text, 'sha256'), 'hex');

  -- 3. Determine or create parent study pack
  if p_parent_pack_id is not null then
    select id into v_pack_id
    from public.study_packs
    where id = p_parent_pack_id and owner_id = v_job.owner_id;
    if not found then
      raise exception 'Specified parent study pack not found or not owned' using errcode = '42501';
    end if;
  else
    v_pack_id := pg_catalog.gen_random_uuid();
    insert into public.study_packs (
      id, owner_id, title, source_type, source_label, status
    ) values (
      v_pack_id, v_job.owner_id, v_job.title, v_job.source_type, v_job.source_label, 'ready'
    );
  end if;

  -- 4. Insert study artifact
  insert into public.study_artifacts (
    id, pack_id, owner_id, kind, origin, status, title, version
  ) values (
    v_artifact_id, v_pack_id, v_job.owner_id, v_job.artifact_kind, 'generated', 'ready', v_job.title, 1
  );

  -- 5. If quiz questions provided, insert questions and keys
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

  -- 6. If structured summary provided, insert into private.summary_content
  if p_summary is not null and jsonb_typeof(p_summary) = 'object' then
    insert into private.summary_content (
      artifact_id, owner_id, schema_version, content
    ) values (
      v_artifact_id, v_job.owner_id, 1, p_summary
    );
  end if;

  -- 7. If flashcards provided, insert into public.flashcards
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

  -- 8. Persist canonical source text into private.study_sources for Tutor retrieval
  insert into private.study_sources (
    pack_id, owner_id, content, content_hash
  ) values (
    v_pack_id, v_job.owner_id, v_source_text, v_content_hash
  )
  on conflict (pack_id) do update
    set content = excluded.content,
        content_hash = excluded.content_hash;

  -- 9. Link source documents if PDF or Scan
  if v_job.source_type = 'pdf' then
    update private.source_documents
    set linked_pack_id = v_pack_id
    where owner_id = v_job.owner_id
      and (linked_pack_id is null or linked_pack_id = v_pack_id)
      and content_hash = v_content_hash;
  elsif v_job.source_type = 'scan' then
    update private.scan_documents
    set pack_id = v_pack_id
    where owner_id = v_job.owner_id
      and (pack_id is null or pack_id = v_pack_id);
  end if;

  -- 10. Check and atomically commit monthly AI usage
  select count into v_used
  from private.monthly_ai_usage
  where user_id = v_job.owner_id and month_key = v_month_key
  for update;

  if coalesce(v_used, 0) >= v_allowance then
    raise exception 'Monthly AI StudyPack allowance reached' using errcode = '42901';
  end if;

  insert into private.monthly_ai_usage (
    user_id, month_key, count, updated_at
  ) values (
    v_job.owner_id, v_month_key, 1, now()
  )
  on conflict (user_id, month_key) do update
    set count = private.monthly_ai_usage.count + 1,
        updated_at = now();

  -- 11. Mark job completed
  update private.generation_jobs
  set status = 'completed',
      stage = 'completed',
      pack_id = v_pack_id,
      artifact_id = v_artifact_id,
      updated_at = now()
  where id = p_job_id;

  -- 12. Purge raw inputs
  delete from private.generation_job_inputs where job_id = p_job_id;

  return jsonb_build_object(
    'status', 'completed',
    'packId', v_pack_id,
    'artifactId', v_artifact_id,
    'reused', false
  );
end;
$$;

revoke all on function private.atomic_finalize_generation_job(uuid, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function private.atomic_finalize_generation_job(uuid, jsonb, jsonb, jsonb, uuid) to postgres, service_role;

-- ============================================================================
-- 5. Public Narrowly Granted Server RPC Wrappers (B1)
-- ============================================================================
-- Wrapper for starting generation jobs from privileged server client
create or replace function public.start_generation_job(
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
  v_active_job record;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may start generation jobs' using errcode = '42501';
  end if;

  -- Enforce one active job per owner
  select id, request_id, payload_hash, status into v_active_job
  from private.generation_jobs
  where owner_id = p_owner_id and status = 'in_progress';

  if v_active_job.id is not null then
    if v_active_job.request_id = p_request_id then
      if v_active_job.payload_hash = p_payload_hash then
        return jsonb_build_object(
          'jobId', v_active_job.id,
          'status', v_active_job.status,
          'reused', true
        );
      else
        raise exception 'Request ID conflict with different payload' using errcode = '23505';
      end if;
    else
      raise exception 'An active generation job is already running for this account' using errcode = '40901';
    end if;
  end if;

  return private.start_generation_job(
    p_owner_id, p_request_id, p_payload_hash, p_artifact_kind,
    p_title, p_source_type, p_source_label, p_source_content, p_requested_count
  );
end;
$$;

revoke all on function public.start_generation_job(uuid, uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.start_generation_job(uuid, uuid, text, text, text, text, text, text, integer) to postgres, service_role;

-- Wrapper for atomic finalization
create or replace function public.atomic_finalize_generation_job(
  p_job_id uuid,
  p_questions jsonb default '[]'::jsonb,
  p_summary jsonb default null,
  p_flashcards jsonb default '[]'::jsonb,
  p_parent_pack_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may finalize generation jobs' using errcode = '42501';
  end if;

  return private.atomic_finalize_generation_job(
    p_job_id, p_questions, p_summary, p_flashcards, p_parent_pack_id
  );
end;
$$;

revoke all on function public.atomic_finalize_generation_job(uuid, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.atomic_finalize_generation_job(uuid, jsonb, jsonb, jsonb, uuid) to postgres, service_role;

-- Server RPC for claiming a batch lease (B3)
create or replace function public.claim_generation_batch(
  p_job_id uuid,
  p_batch_number integer,
  p_lease_owner text,
  p_lease_seconds integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_batch record;
  v_expires timestamptz := now() + (p_lease_seconds || ' seconds')::interval;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may claim generation batches' using errcode = '42501';
  end if;

  select * into v_job
  from private.generation_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  if v_job.cancel_requested or v_job.status in ('cancelled', 'failed', 'completed') then
    return jsonb_build_object('success', false, 'status', v_job.status, 'cancelRequested', v_job.cancel_requested);
  end if;

  -- Update job lease
  update private.generation_jobs
  set lease_owner = p_lease_owner,
      lease_expires_at = v_expires,
      fencing_token = fencing_token + 1,
      stage = 'batching',
      updated_at = now()
  where id = p_job_id;

  -- Upsert or lock batch row
  insert into private.generation_job_batches (
    job_id, batch_number, allocated_count, status
  ) values (
    p_job_id, p_batch_number, 10, 'running'
  )
  on conflict (job_id, batch_number) do update
    set status = 'running', updated_at = now()
  returning * into v_batch;

  return jsonb_build_object(
    'success', true,
    'jobId', p_job_id,
    'batchNumber', p_batch_number,
    'fencingToken', v_job.fencing_token + 1,
    'leaseExpiresAt', v_expires,
    'batchStatus', v_batch.status,
    'acceptedQuestions', v_batch.accepted_questions
  );
end;
$$;

revoke all on function public.claim_generation_batch(uuid, integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_generation_batch(uuid, integer, text, integer) to postgres, service_role;

-- Server RPC for checkpointing accepted batch output (B3)
create or replace function public.checkpoint_generation_batch(
  p_job_id uuid,
  p_batch_number integer,
  p_accepted_items jsonb,
  p_new_accepted_count integer,
  p_stage text default 'batching'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may checkpoint generation batches' using errcode = '42501';
  end if;

  update private.generation_job_batches
  set status = 'completed',
      accepted_questions = p_accepted_items,
      updated_at = now()
  where job_id = p_job_id and batch_number = p_batch_number;

  update private.generation_jobs
  set accepted_count = p_new_accepted_count,
      stage = p_stage,
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.checkpoint_generation_batch(uuid, integer, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.checkpoint_generation_batch(uuid, integer, jsonb, integer, text) to postgres, service_role;

-- Server RPC to read runner job data without hitting private tables directly (B1, B3)
create or replace function public.get_generation_job_for_runner(
  p_job_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_source text;
  v_batches jsonb;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may read runner job data' using errcode = '42501';
  end if;

  select * into v_job
  from private.generation_jobs
  where id = p_job_id;

  if not found then
    return null;
  end if;

  select source_content into v_source
  from private.generation_job_inputs
  where job_id = p_job_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'batchNumber', batch_number,
      'allocatedCount', allocated_count,
      'status', status,
      'acceptedQuestions', accepted_questions
    ) order by batch_number
  ), '[]'::jsonb) into v_batches
  from private.generation_job_batches
  where job_id = p_job_id;

  return jsonb_build_object(
    'job', row_to_json(v_job),
    'sourceContent', coalesce(v_source, ''),
    'batches', v_batches
  );
end;
$$;

revoke all on function public.get_generation_job_for_runner(uuid) from public, anon, authenticated;
grant execute on function public.get_generation_job_for_runner(uuid) to postgres, service_role;

-- ============================================================================
-- 6. Authoritative Flashcard Sessions & Attempts Protection (I5, I6)
-- ============================================================================
-- Revoke direct mutation privileges on flashcard_sessions and flashcard_attempts from authenticated users
revoke insert, update, delete on public.flashcard_sessions from authenticated;
revoke insert, update, delete on public.flashcard_attempts from authenticated;

-- Ensure authenticated can still read their own rows
grant select on public.flashcard_sessions to authenticated;
grant select on public.flashcard_attempts to authenticated;

-- Add parent ownership constraint checks to RLS on study_artifacts and flashcards
drop policy if exists "artifacts_insert_owner" on public.study_artifacts;
create policy "artifacts_insert_owner" on public.study_artifacts
  for insert to authenticated
  with check (
    owner_id = auth.uid() and
    exists (
      select 1 from public.study_packs p
      where p.id = pack_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists flashcards_owner_all on public.flashcards;
drop policy if exists flashcards_owner_select on public.flashcards;
create policy flashcards_owner_select on public.flashcards
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists flashcards_owner_insert on public.flashcards;
create policy flashcards_owner_insert on public.flashcards
  for insert to authenticated
  with check (
    owner_id = auth.uid() and
    exists (
      select 1 from public.study_artifacts a
      where a.id = artifact_id and a.owner_id = auth.uid()
    )
  );

drop policy if exists flashcards_owner_update on public.flashcards;
create policy flashcards_owner_update on public.flashcards
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid() and
    exists (
      select 1 from public.study_artifacts a
      where a.id = artifact_id and a.owner_id = auth.uid()
    )
  );

drop policy if exists flashcards_owner_delete on public.flashcards;
create policy flashcards_owner_delete on public.flashcards
  for delete to authenticated
  using (owner_id = auth.uid());

-- Authoritative RPC to record flashcard attempt with row lock and ordinal replay safety (I5)
create or replace function public.record_flashcard_attempt(
  p_session_id uuid,
  p_card_id uuid,
  p_ordinal integer,
  p_submitted_answer text,
  p_is_correct boolean,
  p_retry_count integer,
  p_next_queue jsonb,
  p_new_status text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session record;
  v_card record;
  v_existing_attempt record;
  v_first_try integer;
  v_mastered integer;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Row-lock session
  select * into v_session
  from public.flashcard_sessions
  where id = p_session_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Flashcard session not found' using errcode = 'P0002';
  end if;

  if v_session.status != 'active' then
    raise exception 'Session is no longer active' using errcode = '22000';
  end if;

  -- Verify card belongs to same artifact and owner
  select * into v_card
  from public.flashcards
  where id = p_card_id and artifact_id = v_session.artifact_id and owner_id = v_uid;

  if not found then
    raise exception 'Card does not belong to session artifact' using errcode = '42501';
  end if;

  -- Idempotency check: if ordinal was already recorded, return existing result
  select * into v_existing_attempt
  from public.flashcard_attempts
  where session_id = p_session_id and ordinal = p_ordinal;

  if v_existing_attempt.id is not null then
    return jsonb_build_object(
      'attemptId', v_existing_attempt.id,
      'sessionId', p_session_id,
      'isCorrect', v_existing_attempt.is_correct,
      'firstTryCorrect', v_session.first_try_correct,
      'cardsMastered', v_session.cards_mastered,
      'replayed', true
    );
  end if;

  -- Insert new attempt
  insert into public.flashcard_attempts (
    session_id, card_id, owner_id, ordinal, submitted_answer, is_correct, retry_count
  ) values (
    p_session_id, p_card_id, v_uid, p_ordinal, p_submitted_answer, p_is_correct, p_retry_count
  );

  -- Compute updated stats
  v_first_try := v_session.first_try_correct;
  if p_is_correct and p_retry_count = 0 then
    v_first_try := v_first_try + 1;
  end if;

  v_mastered := v_session.cards_mastered;
  if p_is_correct then
    v_mastered := v_mastered + 1;
  end if;

  v_status := coalesce(p_new_status, v_session.status);

  update public.flashcard_sessions
  set first_try_correct = v_first_try,
      total_attempts = v_session.total_attempts + 1,
      cards_mastered = v_mastered,
      queue_state = p_next_queue,
      status = v_status,
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'sessionId', p_session_id,
    'ordinal', p_ordinal,
    'isCorrect', p_is_correct,
    'firstTryCorrect', v_first_try,
    'cardsMastered', v_mastered,
    'status', v_status,
    'replayed', false
  );
end;
$$;

revoke all on function public.record_flashcard_attempt(uuid, uuid, integer, text, boolean, integer, jsonb, text) from public, anon;
grant execute on function public.record_flashcard_attempt(uuid, uuid, integer, text, boolean, integer, jsonb, text) to authenticated, service_role;

-- ============================================================================
-- 7. Profile Projection Self/Friend Enforcement (I10)
-- ============================================================================
create or replace function public.get_friend_profile(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_target record;
  v_is_self boolean := false;
  v_is_friend boolean := false;
  v_friendship_status text := 'none';
  v_dm_allowed boolean := true;
  v_can_message boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.education_level,
    p.major_or_program,
    p.primary_subject,
    p.show_education,
    p.show_program,
    p.show_subject
  into v_target
  from public.profiles p
  where lower(p.username) = lower(pg_catalog.btrim(p_username));

  if not found then
    return null;
  end if;

  if v_target.id = v_uid then
    v_is_self := true;
    v_friendship_status := 'self';
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

  -- Strictly enforce self or confirmed friend boundary: strangers receive null
  if not v_is_self and not v_is_friend then
    return null;
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

-- ============================================================================
-- 8. Restrict Maintenance Function cleanup_expired_records (I15)
-- ============================================================================
revoke all on function public.cleanup_expired_records() from public, anon, authenticated;
grant execute on function public.cleanup_expired_records() to postgres, service_role;

create or replace function public.cleanup_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_drafts_deleted integer := 0;
  v_requests_deleted integer := 0;
  v_rooms_finished integer := 0;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Unauthorized maintenance execution' using errcode = '42501';
  end if;

  -- Delete expired drafts (> 7 days)
  delete from public.study_session_drafts
  where updated_at < now() - interval '7 days';
  get diagnostics v_drafts_deleted = row_count;

  -- Delete expired friend requests (> 30 days)
  delete from public.friend_requests
  where status = 'pending' and updated_at < now() - interval '30 days';
  get diagnostics v_requests_deleted = row_count;

  -- Finish expired live rooms (> 24 hours)
  update public.live_rooms
  set status = 'finished', updated_at = now()
  where status in ('waiting', 'in_progress') and created_at < now() - interval '24 hours';
  get diagnostics v_rooms_finished = row_count;

  return jsonb_build_object(
    'draftsDeleted', v_drafts_deleted,
    'requestsDeleted', v_requests_deleted,
    'roomsFinished', v_rooms_finished
  );
end;
$$;

-- ============================================================================
-- 9. Live Room MC-Only Enforcement and Single Signature (I11)
-- ============================================================================
create or replace function public.create_live_room(
  p_pack_id uuid,
  p_artifact_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pack record;
  v_artifact record;
  v_room_id uuid := pg_catalog.gen_random_uuid();
  v_join_code text;
  v_mc_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_pack
  from public.study_packs
  where id = p_pack_id and owner_id = v_uid;

  if not found then
    raise exception 'StudyPack not found or not owned' using errcode = '42501';
  end if;

  if p_artifact_id is not null then
    select * into v_artifact
    from public.study_artifacts
    where id = p_artifact_id and pack_id = p_pack_id and owner_id = v_uid;

    if not found then
      raise exception 'Artifact not found or not owned' using errcode = '42501';
    end if;

    select count(*) into v_mc_count
    from public.questions
    where artifact_id = p_artifact_id and owner_id = v_uid and kind = 'multiple_choice';
  else
    select count(*) into v_mc_count
    from public.questions
    where pack_id = p_pack_id and owner_id = v_uid and kind = 'multiple_choice';
  end if;

  if v_mc_count = 0 then
    raise exception 'Live competition requires at least one multiple-choice question' using errcode = '40001';
  end if;

  -- Generate 6-char alphanumeric join code
  v_join_code := upper(substring(encode(extensions.gen_random_bytes(4), 'hex') from 1 for 6));

  insert into public.live_rooms (
    id, host_id, pack_id, artifact_id, join_code, status
  ) values (
    v_room_id, v_uid, p_pack_id, p_artifact_id, v_join_code, 'waiting'
  );

  return jsonb_build_object(
    'roomId', v_room_id,
    'joinCode', v_join_code,
    'status', 'waiting'
  );
end;
$$;

revoke all on function public.create_live_room(uuid, uuid) from public, anon;
grant execute on function public.create_live_room(uuid, uuid) to authenticated, service_role;
