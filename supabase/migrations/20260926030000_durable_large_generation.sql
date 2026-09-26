-- Migration: 20260926030000_durable_large_generation.sql
-- Description: Phase 3 - Durable large generation pipeline (up to 50 questions), batching, atomic finalization, and private summary content

-- 1. Create private.summary_content table
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

-- 2. Create private.generation_jobs table
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

-- 3. Create private.generation_job_inputs table (holds raw source during job, purged on completion)
create table if not exists private.generation_job_inputs (
  job_id uuid primary key references private.generation_jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_content text not null,
  created_at timestamptz not null default now()
);

alter table private.generation_job_inputs enable row level security;
revoke all on private.generation_job_inputs from anon, authenticated, public;
grant all on private.generation_job_inputs to postgres, service_role;

-- 4. Create private.generation_job_batches table
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

-- 5. RPC: start_generation_job
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

  -- 1. Check for existing job with same request_id
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

  -- 2. Quota check against monthly allowance
  select count into v_used
  from private.monthly_ai_usage
  where user_id = p_owner_id and month_key = v_month_key;

  if coalesce(v_used, 0) >= v_allowance then
    raise exception 'Monthly AI StudyPack allowance reached' using errcode = '42901';
  end if;

  -- 3. Create job
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

  -- 4. Store raw source in private inputs
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

-- 6. RPC: get_generation_job_status
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

-- 7. RPC: request_cancel_generation_job
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

-- 8. RPC: atomic_finalize_generation_job
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

  -- 4. If structured summary provided, insert summary content
  if p_summary is not null and jsonb_typeof(p_summary) = 'object' then
    insert into private.summary_content (
      artifact_id, owner_id, content, source_references
    ) values (
      v_artifact_id, v_job.owner_id, p_summary, coalesce(p_summary->'references', '[]'::jsonb)
    );
  end if;

  -- 5. Insert private study source
  insert into private.study_sources (
    pack_id, owner_id, content, content_hash
  ) values (
    v_pack_id, v_job.owner_id, v_source_text, v_content_hash
  );

  -- 6. Atomically charge monthly quota
  insert into private.monthly_ai_usage (
    user_id, month_key, count
  ) values (
    v_job.owner_id, v_month_key, 1
  )
  on conflict (user_id, month_key)
  do update set count = private.monthly_ai_usage.count + 1, updated_at = now();

  -- 7. Purge job input text
  delete from private.generation_job_inputs where job_id = p_job_id;

  -- 8. Mark job completed
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

-- 9. RPC: get_study_summary
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
