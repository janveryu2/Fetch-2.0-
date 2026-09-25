-- Migration: 20260925241000_expose_ai_quota_rpcs.sql
-- Expose AI generation quota RPCs in public schema for privileged and authenticated PostgREST calls

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

revoke all on function public.get_ai_usage() from public, anon;
grant execute on function public.get_ai_usage() to authenticated, service_role;
