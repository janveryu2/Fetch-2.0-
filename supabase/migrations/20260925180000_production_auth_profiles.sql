-- Migration: 20260925180000_production_auth_profiles.sql
-- Phase 2: Production auth and profiles
-- Minimal profile provisioning trigger on auth.users, ensure_profile repair function, and backfill.

-- 1. Trigger function to automatically provision profiles on user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_raw_username text;
  v_username text;
  v_avatar_url text;
begin
  v_display_name := pg_catalog.substr(
    pg_catalog.btrim(
      coalesce(
        nullif(pg_catalog.btrim(new.raw_user_meta_data->>'display_name'), ''),
        nullif(pg_catalog.btrim(new.raw_user_meta_data->>'full_name'), ''),
        nullif(pg_catalog.btrim(new.raw_user_meta_data->>'name'), ''),
        nullif(pg_catalog.split_part(new.email, '@', 1), ''),
        'FETCH Student'::text
      )
    ), 1, 60
  );
  if pg_catalog.char_length(v_display_name) = 0 then
    v_display_name := 'FETCH Student';
  end if;

  v_raw_username := pg_catalog.lower(pg_catalog.btrim(coalesce(new.raw_user_meta_data->>'username', '')));
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
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture'
  );

  insert into public.profiles (id, display_name, username, avatar_url)
  values (new.id, v_display_name, v_username, v_avatar_url)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Fail-safe so user creation is never aborted by profile initialization
    insert into public.profiles (id, display_name, username)
    values (new.id, 'FETCH Student', null)
    on conflict (id) do nothing;
    return new;
end;
$$;

-- 2. Attach trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Idempotent profile repair function
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

  insert into public.profiles (id, display_name, username, avatar_url)
  values (p_user_id, v_display_name, v_username, v_avatar_url)
  on conflict (id) do update set
    updated_at = pg_catalog.now()
  returning * into v_profile;

  return pg_catalog.to_jsonb(v_profile);
end;
$$;

-- 4. User-invokable ensure_profile RPC
create or replace function public.ensure_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  return private.ensure_profile(v_user_id);
end;
$$;

-- 5. Permissions and grants
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function private.ensure_profile(uuid) from public, anon, authenticated;
grant execute on function public.ensure_profile() to authenticated;

-- 6. Backfill existing auth.users without profiles
insert into public.profiles (id, display_name, username, avatar_url)
select
  u.id,
  pg_catalog.substr(
    pg_catalog.btrim(
      coalesce(
        nullif(pg_catalog.btrim(u.raw_user_meta_data->>'display_name'), ''),
        nullif(pg_catalog.btrim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(pg_catalog.btrim(u.raw_user_meta_data->>'name'), ''),
        nullif(pg_catalog.split_part(u.email, '@', 1), ''),
        'FETCH Student'::text
      )
    ), 1, 60
  ),
  case
    when pg_catalog.lower(pg_catalog.btrim(coalesce(u.raw_user_meta_data->>'username', ''))) ~ '^[a-z0-9_]{3,24}$'
      and not exists (
        select 1 from public.profiles p2
        where p2.username = pg_catalog.lower(pg_catalog.btrim(u.raw_user_meta_data->>'username'))
      )
    then pg_catalog.lower(pg_catalog.btrim(u.raw_user_meta_data->>'username'))
    else null
  end,
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
