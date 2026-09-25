-- Migration: 20260925183000_auth_profiles_hardening.sql
-- Hardening for Auth & Profiles:
-- 1. Atomic username availability check RPC that bypasses RLS safely without data leakage.
-- 2. Race-condition hardening in private.ensure_profile if concurrent username claim occurs.

create or replace function public.check_username_available(
  p_username text,
  p_current_user_id uuid default null
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select not exists (
    select 1 from public.profiles
    where username = pg_catalog.lower(pg_catalog.btrim(p_username))
      and (p_current_user_id is null or id <> p_current_user_id)
  );
$$;

revoke all on function public.check_username_available(text, uuid) from public, anon;
grant execute on function public.check_username_available(text, uuid) to authenticated, anon;

create or replace function private.ensure_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_profile record;
  v_display_name text;
  v_raw_username text;
  v_username text;
  v_avatar_url text;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if found then
    return pg_catalog.to_jsonb(v_profile);
  end if;

  select * into v_user from auth.users where id = p_user_id;
  if not found then
    return null;
  end if;

  v_display_name := pg_catalog.substr(
    pg_catalog.btrim(
      coalesce(
        nullif(pg_catalog.btrim(v_user.raw_user_meta_data->>'display_name'), ''),
        nullif(pg_catalog.btrim(v_user.raw_user_meta_data->>'full_name'), ''),
        nullif(pg_catalog.btrim(v_user.raw_user_meta_data->>'name'), ''),
        nullif(pg_catalog.split_part(v_user.email, '@', 1), ''),
        'FETCH Student'::text
      )
    ), 1, 60
  );
  if pg_catalog.char_length(v_display_name) = 0 then
    v_display_name := 'FETCH Student';
  end if;

  v_raw_username := pg_catalog.lower(pg_catalog.btrim(coalesce(v_user.raw_user_meta_data->>'username', '')));
  if v_raw_username ~ '^[a-z0-9_]{3,24}$' then
    if not exists (select 1 from public.profiles where username = v_raw_username) then
      v_username := v_raw_username;
    else
      v_username := null;
    end if;
  else
    v_username := null;
  end if;

  v_avatar_url := coalesce(
    v_user.raw_user_meta_data->>'avatar_url',
    v_user.raw_user_meta_data->>'picture'
  );

  begin
    insert into public.profiles (id, display_name, username, avatar_url)
    values (p_user_id, v_display_name, v_username, v_avatar_url)
    on conflict (id) do update set
      updated_at = pg_catalog.now()
    returning * into v_profile;
  exception
    when unique_violation then
      -- Fallback if username was concurrently claimed
      insert into public.profiles (id, display_name, username, avatar_url)
      values (p_user_id, v_display_name, null, v_avatar_url)
      on conflict (id) do update set
        updated_at = pg_catalog.now()
      returning * into v_profile;
  end;

  return pg_catalog.to_jsonb(v_profile);
end;
$$;
