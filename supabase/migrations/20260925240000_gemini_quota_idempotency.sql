-- Migration: 20260925240000_gemini_quota_idempotency.sql
-- Phase 5: Gemini generation, quota reservation/commit/release, and idempotency

-- 1. Account entitlement overrides table
create table if not exists private.account_entitlement_overrides (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  allowance integer not null check (allowance >= 0),
  effective_from timestamptz not null default now(),
  effective_until timestamptz default null
);

-- 2. Quota Reservation RPC
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

  -- Check existing request for this (owner_id, request_id)
  select * into v_req from private.generation_requests
  where owner_id = p_owner_id and request_id = p_request_id;

  if found then
    -- If already committed, return the completed pack
    if v_req.state = 'committed' and v_req.pack_id is not null then
      return pg_catalog.jsonb_build_object(
        'status', 'committed',
        'packId', v_req.pack_id,
        'requestId', p_request_id
      );
    end if;

    -- If payload hash changed for same request ID, reject
    if v_req.payload_hash <> p_payload_hash then
      raise exception 'Request ID conflict: payload does not match' using errcode = '23505';
    end if;

    -- If reserved recently (< 3 minutes), report in_progress
    if v_req.state = 'reserved' and v_req.updated_at > (now() - interval '3 minutes') then
      return pg_catalog.jsonb_build_object(
        'status', 'in_progress',
        'fencingToken', v_req.fencing_token,
        'requestId', p_request_id
      );
    end if;
  end if;

  -- Check entitlement override
  select allowance into v_override
  from private.account_entitlement_overrides
  where owner_id = p_owner_id
    and now() >= effective_from
    and (effective_until is null or now() <= effective_until);

  if v_override is not null then
    v_allowance := v_override;
  end if;

  -- Lock and update or insert monthly_ai_usage
  insert into private.monthly_ai_usage (owner_id, month_key, reserved_count, committed_count)
  values (p_owner_id, v_month_key, 0, 0)
  on conflict (owner_id, month_key) do nothing;

  select * into v_usage
  from private.monthly_ai_usage
  where owner_id = p_owner_id and month_key = v_month_key
  for update;

  -- Expire stale reservations (> 5 mins old)
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

  -- Quota check: committed + reserved < allowance
  if (v_usage.committed_count + v_usage.reserved_count) >= v_allowance then
    raise exception 'Monthly AI StudyPack allowance reached (%/month)', v_allowance using errcode = '42901';
  end if;

  -- Increment reserved count
  update private.monthly_ai_usage
  set reserved_count = reserved_count + 1, updated_at = now()
  where owner_id = p_owner_id and month_key = v_month_key;

  v_fencing_token := coalesce(v_req.fencing_token, 0) + 1;

  -- Upsert generation request
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

-- 3. Quota Commit RPC
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

-- 4. Quota Release RPC
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

-- 5. AI Usage Reading Functions
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

create or replace function public.get_ai_usage()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.get_ai_usage(auth.uid());
$$;

-- 6. Permissions
revoke all on function private.reserve_ai_generation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.reserve_ai_generation(uuid, uuid, text) to postgres, service_role;

revoke all on function private.commit_ai_generation(uuid, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function private.commit_ai_generation(uuid, uuid, bigint, uuid) to postgres, service_role;

revoke all on function private.release_ai_generation(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function private.release_ai_generation(uuid, uuid, bigint, text) to postgres, service_role;

revoke all on function private.get_ai_usage(uuid) from public, anon, authenticated;
grant execute on function private.get_ai_usage(uuid) to postgres, service_role, authenticated;

revoke all on function public.get_ai_usage() from public, anon;
grant execute on function public.get_ai_usage() to authenticated;
