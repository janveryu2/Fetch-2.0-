-- Repair the live stage constraint and make pg_cron actively wake eligible jobs.
-- Apply before deploying the matching worker route. No service-role key enters pg_net.

alter table private.generation_jobs
  drop constraint if exists generation_jobs_stage_check;
alter table private.generation_jobs
  add constraint generation_jobs_stage_check check (
    stage in ('queued', 'claimed', 'extracting', 'batching', 'grounding',
              'finalizing', 'retrying', 'completed', 'failed', 'cancelled')
  );

alter table private.generation_jobs
  add column if not exists last_wakeup_at timestamptz;

create table if not exists private.generation_dispatch_config (
  id integer primary key check (id = 1),
  target_url text not null,
  updated_at timestamptz not null default now()
);
alter table private.generation_dispatch_config enable row level security;

-- The worker credential belongs to the database and is encrypted by Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fetch_generation_worker_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'fetch_generation_worker_token',
      'Credential for pg_net generation wakeups'
    );
  end if;
end $$;

create or replace function public.configure_generation_dispatch(p_target_url text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
begin
  if v_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Server role required' using errcode = '42501';
  end if;
  if p_target_url is null or p_target_url !~ '^https://[A-Za-z0-9.-]+$' then
    raise exception 'Generation worker target must be a HTTPS origin' using errcode = '22023';
  end if;
  insert into private.generation_dispatch_config (id, target_url)
  values (1, p_target_url)
  on conflict (id) do update
    set target_url = excluded.target_url, updated_at = now();
  return true;
end;
$$;
revoke all on function public.configure_generation_dispatch(text) from public, anon, authenticated;
grant execute on function public.configure_generation_dispatch(text) to service_role;

create or replace function public.authorize_generation_dispatch(p_token text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_secret text;
begin
  if v_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Server role required' using errcode = '42501';
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'fetch_generation_worker_token';
  return p_token is not null and length(p_token) = 64 and p_token = v_secret;
end;
$$;
revoke all on function public.authorize_generation_dispatch(text) from public, anon, authenticated;
grant execute on function public.authorize_generation_dispatch(text) to service_role;

create or replace function private.enqueue_generation_wakeup(p_job_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_job private.generation_jobs%rowtype;
  v_target text;
  v_secret text;
  v_request_id bigint;
begin
  select * into v_job from private.generation_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'in_progress' or v_job.cancel_requested then
    return jsonb_build_object('success', false, 'reason', 'not_eligible');
  end if;
  if (v_job.next_run_at is not null and v_job.next_run_at > now())
     or (v_job.lease_expires_at is not null and v_job.lease_expires_at > now()) then
    return jsonb_build_object('success', true, 'reason', 'already_scheduled');
  end if;
  if v_job.last_wakeup_at is not null and v_job.last_wakeup_at > now() - interval '15 seconds' then
    return jsonb_build_object('success', true, 'reason', 'recently_dispatched');
  end if;
  select target_url into v_target from private.generation_dispatch_config where id = 1;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'fetch_generation_worker_token';
  if v_target is null or v_secret is null then
    raise exception 'Generation dispatcher is not configured' using errcode = '55000';
  end if;

  v_request_id := net.http_post(
    url := v_target || '/api/internal/generation/step',
    body := jsonb_build_object('jobId', p_job_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-fetch-worker-token', v_secret),
    timeout_milliseconds := 60000
  );
  update private.generation_jobs set last_wakeup_at = now() where id = p_job_id;
  insert into private.generation_events (job_id, event_type, stage, metadata)
  values (p_job_id, 'wakeup_enqueued', v_job.stage,
          jsonb_build_object('requestId', v_request_id));
  return jsonb_build_object('success', true, 'reason', 'enqueued', 'requestId', v_request_id);
end;
$$;
revoke all on function private.enqueue_generation_wakeup(uuid) from public, anon, authenticated;

create or replace function public.dispatch_generation_job(p_job_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
begin
  if v_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Server role required' using errcode = '42501';
  end if;
  return private.enqueue_generation_wakeup(p_job_id);
end;
$$;
revoke all on function public.dispatch_generation_job(uuid) from public, anon, authenticated;
grant execute on function public.dispatch_generation_job(uuid) to service_role;

-- The checkpoint RPC retains its lease. Yield it explicitly before the next batch.
create or replace function public.yield_generation_step(
  p_job_id uuid, p_lease_owner text, p_fencing_token integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
begin
  if v_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Server role required' using errcode = '42501';
  end if;
  update private.generation_jobs
  set lease_owner = null, lease_expires_at = null, next_run_at = now(),
      last_wakeup_at = null, updated_at = now()
  where id = p_job_id and status = 'in_progress'
    and lease_owner = p_lease_owner and fencing_token = p_fencing_token;
  return found;
end;
$$;
revoke all on function public.yield_generation_step(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.yield_generation_step(uuid, text, integer) to service_role;

create or replace function public.recover_generation_jobs(p_limit integer default 12)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_dispatched integer := 0;
  v_dispatch_errors integer := 0;
  v_failed integer := 0;
  v_sweep jsonb;
begin
  if v_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Server role required' using errcode = '42501';
  end if;
  v_sweep := public.sweep_generation_jobs(75, 10);

  -- No student should wait indefinitely for a worker that never claims the job.
  for v_job in
    select id from private.generation_jobs
    where status = 'in_progress' and worker_claimed_at is null
      and created_at < now() - interval '90 seconds'
    order by created_at limit 50 for update skip locked
  loop
    perform private.release_generation_job(
      v_job.id, 'WORKER_START_FAILED',
      'FETCH could not start this generation. Please retry.', false
    );
    v_failed := v_failed + 1;
  end loop;

  for v_job in
    select id from private.generation_jobs
    where status = 'in_progress' and cancel_requested = false
      and next_run_at <= now()
      and (lease_expires_at is null or lease_expires_at < now())
      and (last_wakeup_at is null or last_wakeup_at < now() - interval '15 seconds')
    order by created_at limit least(greatest(p_limit, 1), 30)
    for update skip locked
  loop
    begin
      perform private.enqueue_generation_wakeup(v_job.id);
      v_dispatched := v_dispatched + 1;
    exception when others then
      -- One bad HTTP enqueue must not roll back release of other stale jobs.
      v_dispatch_errors := v_dispatch_errors + 1;
      insert into private.generation_events (job_id, event_type, stage, metadata)
      values (v_job.id, 'wakeup_failed', null, jsonb_build_object('sqlstate', SQLSTATE));
    end;
  end loop;
  return jsonb_build_object('success', true, 'sweep', v_sweep,
                            'dispatchedCount', v_dispatched,
                            'dispatchErrorCount', v_dispatch_errors,
                            'startFailedCount', v_failed);
end;
$$;
revoke all on function public.recover_generation_jobs(integer) from public, anon, authenticated;
grant execute on function public.recover_generation_jobs(integer) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep-stale-generation-jobs') then
    perform cron.unschedule('sweep-stale-generation-jobs');
  end if;
end $$;
select cron.schedule(
  'sweep-stale-generation-jobs', '* * * * *',
  'select public.recover_generation_jobs(12);'
);

notify pgrst, 'reload schema';
