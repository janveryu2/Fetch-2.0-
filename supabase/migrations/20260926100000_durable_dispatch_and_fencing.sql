-- ============================================================================
-- Migration: 20260926100000_durable_dispatch_and_fencing.sql
-- Description: Phase 1 & 2: Durable generation dispatch, monotonic fencing tokens,
--              atomic step claims, authoritative batch checkpoints, heartbeat,
--              watchdog sweeper, and owner-scoped job listing.
-- ============================================================================

-- 1. Ensure required extensions exist
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists supabase_vault with schema extensions;

-- 2. Enhance private.generation_jobs with lifecycle, fencing, and scheduling fields
alter table private.generation_jobs
  add column if not exists next_run_at timestamptz not null default timezone('UTC', now()),
  add column if not exists dispatch_attempts integer not null default 0,
  add column if not exists provider_attempts integer not null default 0,
  add column if not exists worker_claimed_at timestamptz,
  add column if not exists worker_last_seen_at timestamptz,
  add column if not exists last_progress_at timestamptz,
  add column if not exists deadline_at timestamptz default (timezone('UTC', now()) + interval '30 minutes');

-- Ensure fencing_token defaults to 0 and not null
alter table private.generation_jobs
  alter column fencing_token set default 0;

-- 3. Enhance private.generation_job_batches with checkpoint and attempt tracking
alter table private.generation_job_batches
  add column if not exists lease_owner text,
  add column if not exists fencing_token integer not null default 0,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists checkpoint_at timestamptz;

-- 4. Create indexes for admission, dispatch eligibility, and owner queries
-- Single active generation job per account (admission control)
create unique index if not exists idx_active_generation_job_per_owner
  on private.generation_jobs (owner_id)
  where status = 'in_progress';

-- Dispatch eligibility index for worker pickup and sweeper
create index if not exists idx_generation_jobs_eligible_dispatch
  on private.generation_jobs (next_run_at, lease_expires_at)
  where status = 'in_progress' and cancel_requested = false;

-- Fast owner-scoped jobs listing (for App Shell & background tasks)
create index if not exists idx_generation_jobs_owner_status
  on private.generation_jobs (owner_id, status, created_at desc);

-- 5. Append-only generation audit and correlation event table
create table if not exists private.generation_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.generation_jobs(id) on delete cascade,
  event_type text not null,
  worker_id text,
  fencing_token integer,
  batch_number integer,
  stage text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('UTC', now())
);

create index if not exists idx_generation_events_job_id
  on private.generation_events (job_id, created_at asc);

-- 6. Core RPC: private.claim_generation_step
create or replace function private.claim_generation_step(
  p_worker_id text,
  p_job_id uuid default null,
  p_lease_seconds integer default 75
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_new_fencing integer;
  v_expires timestamptz := now() + (p_lease_seconds || ' seconds')::interval;
  v_target_id uuid := p_job_id;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may claim generation steps' using errcode = '42501';
  end if;

  if v_target_id is null then
    -- Find oldest eligible job
    select id into v_target_id
    from private.generation_jobs
    where status = 'in_progress'
      and cancel_requested = false
      and (lease_expires_at is null or lease_expires_at < now())
      and (next_run_at is null or next_run_at <= now())
    order by created_at asc
    limit 1
    for update skip locked;
  end if;

  if v_target_id is null then
    return jsonb_build_object('success', false, 'reason', 'no_eligible_jobs');
  end if;

  -- Lock specific target job
  select * into v_job
  from private.generation_jobs
  where id = v_target_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_job.status in ('completed', 'failed', 'cancelled') then
    return jsonb_build_object('success', false, 'reason', 'already_completed', 'status', v_job.status);
  end if;

  if v_job.cancel_requested then
    return jsonb_build_object('success', false, 'reason', 'cancelled', 'status', v_job.status);
  end if;

  -- Refuse active lease held by another worker
  if v_job.lease_expires_at is not null and v_job.lease_expires_at > now() and v_job.lease_owner is distinct from p_worker_id then
    return jsonb_build_object('success', false, 'reason', 'busy', 'leaseOwner', v_job.lease_owner);
  end if;

  -- Monotonically increment fencing token
  v_new_fencing := coalesce(v_job.fencing_token, 0) + 1;

  update private.generation_jobs
  set lease_owner = p_worker_id,
      fencing_token = v_new_fencing,
      lease_expires_at = v_expires,
      worker_claimed_at = coalesce(worker_claimed_at, now()),
      worker_last_seen_at = now(),
      dispatch_attempts = dispatch_attempts + 1,
      stage = case when stage = 'queued' then 'claimed' else stage end,
      updated_at = now()
  where id = v_target_id;

  -- Log claim event
  insert into private.generation_events (
    job_id, event_type, worker_id, fencing_token, stage, metadata
  ) values (
    v_target_id, 'claimed', p_worker_id, v_new_fencing,
    case when v_job.stage = 'queued' then 'claimed' else v_job.stage end,
    jsonb_build_object('dispatchAttempts', v_job.dispatch_attempts + 1, 'leaseExpiresAt', v_expires)
  );

  return jsonb_build_object(
    'success', true,
    'reason', 'claimed',
    'jobId', v_target_id,
    'fencingToken', v_new_fencing,
    'leaseExpiresAt', v_expires,
    'artifactKind', v_job.artifact_kind,
    'requestedCount', v_job.requested_count,
    'acceptedCount', v_job.accepted_count,
    'stage', case when v_job.stage = 'queued' then 'claimed' else v_job.stage end,
    'title', v_job.title,
    'sourceType', v_job.source_type,
    'sourceLabel', v_job.source_label
  );
end;
$$;

revoke all on function private.claim_generation_step(text, uuid, integer) from public, anon, authenticated;
grant execute on function private.claim_generation_step(text, uuid, integer) to postgres, service_role;

-- Public wrapper for claim_generation_step
create or replace function public.claim_generation_step(
  p_worker_id text,
  p_job_id uuid default null,
  p_lease_seconds integer default 75
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may claim generation steps' using errcode = '42501';
  end if;

  return private.claim_generation_step(p_worker_id, p_job_id, p_lease_seconds);
end;
$$;

revoke all on function public.claim_generation_step(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_generation_step(text, uuid, integer) to postgres, service_role;

-- 7. Heartbeat RPC: public.heartbeat_generation_job
create or replace function public.heartbeat_generation_job(
  p_job_id uuid,
  p_lease_owner text,
  p_fencing_token integer,
  p_extend_seconds integer default 60
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_new_expires timestamptz := now() + (p_extend_seconds || ' seconds')::interval;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may heartbeat generation jobs' using errcode = '42501';
  end if;

  select * into v_job
  from private.generation_jobs
  where id = p_job_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_job.status in ('completed', 'failed', 'cancelled') then
    return jsonb_build_object('success', false, 'reason', 'already_completed', 'status', v_job.status);
  end if;

  if v_job.cancel_requested then
    return jsonb_build_object('success', false, 'reason', 'cancelled', 'status', v_job.status);
  end if;

  -- Fencing check
  if v_job.fencing_token is distinct from p_fencing_token or v_job.lease_owner is distinct from p_lease_owner then
    return jsonb_build_object('success', false, 'reason', 'fenced', 'currentFencing', v_job.fencing_token);
  end if;

  update private.generation_jobs
  set lease_expires_at = v_new_expires,
      worker_last_seen_at = now(),
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object('success', true, 'leaseExpiresAt', v_new_expires);
end;
$$;

revoke all on function public.heartbeat_generation_job(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.heartbeat_generation_job(uuid, text, integer, integer) to postgres, service_role;

-- 8. Fenced Checkpoint Batch RPC (replaces old un-fenced checkpoint)
create or replace function public.checkpoint_generation_batch(
  p_job_id uuid,
  p_batch_number integer,
  p_accepted_items jsonb,
  p_new_accepted_count integer default null,
  p_stage text default 'batching',
  p_lease_owner text default null,
  p_fencing_token integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_total_accepted integer := 0;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may checkpoint generation batches' using errcode = '42501';
  end if;

  select * into v_job
  from private.generation_jobs
  where id = p_job_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_job.status in ('completed', 'failed', 'cancelled') then
    return jsonb_build_object('success', false, 'reason', 'already_terminal', 'status', v_job.status);
  end if;

  if v_job.cancel_requested then
    return jsonb_build_object('success', false, 'reason', 'cancelled', 'status', v_job.status);
  end if;

  -- Fencing token enforcement when provided
  if p_fencing_token is not null and v_job.fencing_token is distinct from p_fencing_token then
    return jsonb_build_object('success', false, 'reason', 'fenced', 'currentFencing', v_job.fencing_token);
  end if;

  if p_lease_owner is not null and v_job.lease_owner is distinct from p_lease_owner then
    return jsonb_build_object('success', false, 'reason', 'fenced', 'currentOwner', v_job.lease_owner);
  end if;

  -- Persist batch result
  insert into private.generation_job_batches (
    job_id, batch_number, allocated_count, status, accepted_questions, checkpoint_at, updated_at
  ) values (
    p_job_id, p_batch_number, coalesce(jsonb_array_length(p_accepted_items), 0), 'completed', p_accepted_items, now(), now()
  )
  on conflict (job_id, batch_number) do update
    set status = 'completed',
        accepted_questions = p_accepted_items,
        checkpoint_at = now(),
        updated_at = now();

  -- Authoritatively recompute total accepted count from persisted batch checkpoints
  select coalesce(sum(jsonb_array_length(accepted_questions)), 0)
  into v_total_accepted
  from private.generation_job_batches
  where job_id = p_job_id and status = 'completed';

  update private.generation_jobs
  set accepted_count = v_total_accepted,
      stage = p_stage,
      worker_last_seen_at = now(),
      last_progress_at = now(),
      updated_at = now()
  where id = p_job_id;

  -- Record event
  insert into private.generation_events (
    job_id, event_type, worker_id, fencing_token, batch_number, stage, metadata
  ) values (
    p_job_id, 'batch_checkpointed', p_lease_owner, p_fencing_token, p_batch_number, p_stage,
    jsonb_build_object('acceptedCount', v_total_accepted, 'batchItemCount', coalesce(jsonb_array_length(p_accepted_items), 0))
  );

  return jsonb_build_object('success', true, 'acceptedCount', v_total_accepted);
end;
$$;

revoke all on function public.checkpoint_generation_batch(uuid, integer, jsonb, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.checkpoint_generation_batch(uuid, integer, jsonb, integer, text, text, integer) to postgres, service_role;

-- 9. Owner-scoped Active Jobs RPC (for App Shell & background tasks)
create or replace function public.list_my_generation_jobs(
  p_active_only boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_jobs jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'jobId', j.id,
      'artifactKind', j.artifact_kind,
      'title', j.title,
      'sourceType', j.source_type,
      'sourceLabel', j.source_label,
      'requestedCount', j.requested_count,
      'acceptedCount', j.accepted_count,
      'stage', j.stage,
      'status', j.status,
      'cancelRequested', j.cancel_requested,
      'failureCode', j.failure_code,
      'failureMessage', j.failure_message,
      'packId', j.pack_id,
      'artifactId', j.artifact_id,
      'createdAt', j.created_at,
      'updatedAt', j.updated_at
    ) order by j.created_at desc
  ), '[]'::jsonb) into v_jobs
  from private.generation_jobs j
  where j.owner_id = v_uid
    and (not p_active_only or j.status = 'in_progress');

  return v_jobs;
end;
$$;

revoke all on function public.list_my_generation_jobs(boolean) from public, anon;
grant execute on function public.list_my_generation_jobs(boolean) to authenticated, service_role;

-- 10. Watchdog Sweeper RPC
create or replace function public.sweep_generation_jobs(
  p_stale_seconds integer default 75,
  p_deadline_minutes integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_expired_count integer := 0;
  v_cancelled_count integer := 0;
  v_reclaimed_count integer := 0;
  v_rec record;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may sweep generation jobs' using errcode = '42501';
  end if;

  -- 1. Expire jobs past absolute deadline
  for v_rec in
    select id from private.generation_jobs
    where status = 'in_progress'
      and (deadline_at is not null and deadline_at < now() or created_at < now() - (p_deadline_minutes || ' minutes')::interval)
  loop
    perform private.release_generation_job(v_rec.id, 'DEADLINE_EXCEEDED', 'Job execution exceeded maximum allowed deadline', false);
    v_expired_count := v_expired_count + 1;
  end loop;

  -- 2. Cleanly release cancelled jobs where worker didn't gracefully exit
  for v_rec in
    select id from private.generation_jobs
    where status = 'in_progress'
      and cancel_requested = true
  loop
    perform private.release_generation_job(v_rec.id, 'USER_CANCELLED', 'Job cancelled by student', true);
    v_cancelled_count := v_cancelled_count + 1;
  end loop;

  -- 3. Reset leases on jobs with expired workers for redispatch
  update private.generation_jobs
  set lease_owner = null,
      lease_expires_at = null,
      next_run_at = now(),
      updated_at = now()
  where status = 'in_progress'
    and cancel_requested = false
    and lease_expires_at is not null
    and lease_expires_at < now();

  get diagnostics v_reclaimed_count = row_count;

  return jsonb_build_object(
    'success', true,
    'expiredCount', v_expired_count,
    'cancelledCount', v_cancelled_count,
    'reclaimedCount', v_reclaimed_count
  );
end;
$$;

revoke all on function public.sweep_generation_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.sweep_generation_jobs(integer, integer) to postgres, service_role;

-- 11. Schedule watchdog sweeper via pg_cron (runs every minute)
select cron.schedule(
  'sweep-stale-generation-jobs',
  '* * * * *',
  'select public.sweep_generation_jobs(75, 30);'
);
