-- ============================================================================
-- Migration: 20260926110000_retry_and_cancellation_hardening.sql
-- Description: Phase 2: Bounded retry scheduling, cancellation lock, and immediate
--              cancellation release for queued jobs without an active lease.
-- ============================================================================

-- 1. RPC: public.record_generation_retry
create or replace function public.record_generation_retry(
  p_job_id uuid,
  p_fencing_token integer,
  p_error_code text,
  p_error_message text,
  p_delay_seconds integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_delay interval := (p_delay_seconds || ' seconds')::interval;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may record generation retries' using errcode = '42501';
  end if;

  select * into v_job
  from private.generation_jobs
  where id = p_job_id
  for update;

  if not found or v_job.status in ('completed', 'failed', 'cancelled') then
    return jsonb_build_object('success', false, 'reason', 'not_in_progress');
  end if;

  if v_job.fencing_token is distinct from p_fencing_token then
    return jsonb_build_object('success', false, 'reason', 'fenced');
  end if;

  update private.generation_jobs
  set provider_attempts = provider_attempts + 1,
      next_run_at = now() + v_delay,
      lease_owner = null,
      lease_expires_at = null,
      stage = 'retrying',
      failure_code = p_error_code,
      failure_message = p_error_message,
      updated_at = now()
  where id = p_job_id;

  insert into private.generation_events (
    job_id, event_type, fencing_token, stage, metadata
  ) values (
    p_job_id, 'retrying', p_fencing_token, 'retrying',
    jsonb_build_object(
      'errorCode', p_error_code,
      'delaySeconds', p_delay_seconds,
      'providerAttempts', v_job.provider_attempts + 1
    )
  );

  return jsonb_build_object(
    'success', true,
    'nextRunAt', now() + v_delay,
    'providerAttempts', v_job.provider_attempts + 1
  );
end;
$$;

revoke all on function public.record_generation_retry(uuid, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_generation_retry(uuid, integer, text, text, integer) to postgres, service_role;

-- 2. Enhance public.request_cancel_generation_job to immediately release when unleased or queued
create or replace function public.request_cancel_generation_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_job
  from private.generation_jobs
  where id = p_job_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Job not found or not owned' using errcode = '42501';
  end if;

  if v_job.status = 'completed' then
    return jsonb_build_object('jobId', p_job_id, 'status', 'completed', 'cancelRequested', false);
  end if;

  if v_job.status in ('failed', 'cancelled') then
    return jsonb_build_object('jobId', p_job_id, 'status', v_job.status, 'cancelRequested', false);
  end if;

  -- If job has no active lease or is still queued, release reservation immediately!
  if v_job.stage = 'queued' or v_job.lease_owner is null or (v_job.lease_expires_at is not null and v_job.lease_expires_at < now()) then
    perform private.release_generation_job(p_job_id, 'USER_CANCELLED', 'Job cancelled by student while queued', true);
    return jsonb_build_object(
      'jobId', p_job_id,
      'cancelRequested', true,
      'status', 'cancelled'
    );
  end if;

  -- Otherwise, flag cancel_requested so the active worker releases on next checkpoint / heartbeat
  update private.generation_jobs
  set cancel_requested = true,
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'jobId', p_job_id,
    'cancelRequested', true,
    'status', v_job.status
  );
end;
$$;

revoke all on function public.request_cancel_generation_job(uuid) from public, anon;
grant execute on function public.request_cancel_generation_job(uuid) to authenticated, service_role;
