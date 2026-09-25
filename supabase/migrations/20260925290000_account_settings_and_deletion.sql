-- Migration: 20260925290000_account_settings_and_deletion.sql
-- Phase 12: Account Settings, Preferences, and Cascading Deletion Verification

-- 1. Create private account preferences table
create table if not exists private.account_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discoverable boolean not null default true,
  allow_direct_messages boolean not null default true,
  study_reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.account_preferences enable row level security;

-- 2. Owner RPC to get account preferences
create or replace function public.get_account_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_prefs from private.account_preferences where user_id = v_uid;
  if not found then
    insert into private.account_preferences (user_id, discoverable, allow_direct_messages, study_reminders)
    values (v_uid, true, true, true)
    on conflict (user_id) do nothing;

    select * into v_prefs from private.account_preferences where user_id = v_uid;
  end if;

  return jsonb_build_object(
    'discoverable', coalesce(v_prefs.discoverable, true),
    'allow_direct_messages', coalesce(v_prefs.allow_direct_messages, true),
    'study_reminders', coalesce(v_prefs.study_reminders, true)
  );
end;
$$;

-- 3. Owner RPC to update account preferences
create or replace function public.update_account_preferences(
  p_discoverable boolean default null,
  p_allow_direct_messages boolean default null,
  p_study_reminders boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into private.account_preferences (user_id, discoverable, allow_direct_messages, study_reminders, updated_at)
  values (
    v_uid,
    coalesce(p_discoverable, true),
    coalesce(p_allow_direct_messages, true),
    coalesce(p_study_reminders, true),
    now()
  )
  on conflict (user_id) do update set
    discoverable = coalesce(p_discoverable, private.account_preferences.discoverable),
    allow_direct_messages = coalesce(p_allow_direct_messages, private.account_preferences.allow_direct_messages),
    study_reminders = coalesce(p_study_reminders, private.account_preferences.study_reminders),
    updated_at = now()
  returning * into v_prefs;

  return jsonb_build_object(
    'discoverable', v_prefs.discoverable,
    'allow_direct_messages', v_prefs.allow_direct_messages,
    'study_reminders', v_prefs.study_reminders
  );
end;
$$;

revoke all on function public.get_account_preferences() from public;
grant execute on function public.get_account_preferences() to authenticated, service_role;

revoke all on function public.update_account_preferences(boolean, boolean, boolean) from public;
grant execute on function public.update_account_preferences(boolean, boolean, boolean) to authenticated, service_role;
