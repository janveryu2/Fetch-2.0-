-- Migration: 20260926000000_student_onboarding_preferences.sql
-- Phase 1: Student Onboarding Preferences and Legacy Backfill

-- 1. Create private student preferences table
create table if not exists private.student_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_subject text check (primary_subject is null or (char_length(trim(primary_subject)) > 0 and char_length(primary_subject) <= 100)),
  study_goal text check (study_goal is null or study_goal in ('exam', 'understand', 'habit')),
  focus_minutes integer not null default 25 check (focus_minutes in (15, 25, 45)),
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending', 'completed', 'skipped')),
  onboarding_version integer not null default 1,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.student_preferences enable row level security;

-- Table security: no direct access for anon or authenticated
revoke all on table private.student_preferences from anon, authenticated, public;
grant all on table private.student_preferences to service_role;

-- 2. Backfill existing users at migration time with skipped status and default focus duration
insert into private.student_preferences (
  user_id,
  primary_subject,
  study_goal,
  focus_minutes,
  onboarding_status,
  onboarding_version,
  completed_at,
  created_at,
  updated_at
)
select
  id as user_id,
  null as primary_subject,
  null as study_goal,
  25 as focus_minutes,
  'skipped' as onboarding_status,
  1 as onboarding_version,
  null as completed_at,
  now() as created_at,
  now() as updated_at
from auth.users
on conflict (user_id) do nothing;

-- 3. Owner RPC to get normalized student preferences
create or replace function public.get_student_preferences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is true then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_row from private.student_preferences where user_id = v_uid;
  if not found then
    return jsonb_build_object(
      'primarySubject', null,
      'studyGoal', null,
      'focusMinutes', 25,
      'onboardingStatus', 'pending',
      'onboardingVersion', 1,
      'completedAt', null
    );
  end if;

  return jsonb_build_object(
    'primarySubject', v_row.primary_subject,
    'studyGoal', v_row.study_goal,
    'focusMinutes', v_row.focus_minutes,
    'onboardingStatus', v_row.onboarding_status,
    'onboardingVersion', v_row.onboarding_version,
    'completedAt', v_row.completed_at
  );
end;
$$;

revoke all on function public.get_student_preferences() from public;
grant execute on function public.get_student_preferences() to authenticated, service_role;

-- 4. Owner RPC to save/complete/skip student preferences
create or replace function public.save_student_preferences(
  p_primary_subject text default null,
  p_study_goal text default null,
  p_focus_minutes integer default 25,
  p_action text default 'save'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_subj text;
  v_goal text;
  v_focus integer;
  v_row record;
  v_now timestamptz := now();
begin
  if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) is true then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_action not in ('complete', 'skip', 'save') then
    raise exception 'Invalid action: %', p_action using errcode = '22023';
  end if;

  if v_action = 'skip' then
    v_subj := null;
    v_goal := null;
    v_focus := 25;
  else
    v_subj := nullif(trim(p_primary_subject), '');
    if v_subj is not null and char_length(v_subj) > 100 then
      raise exception 'Primary subject exceeds 100 characters' using errcode = '22023';
    end if;

    v_goal := nullif(trim(p_study_goal), '');
    if v_goal is not null and v_goal not in ('exam', 'understand', 'habit') then
      raise exception 'Invalid study goal: %', p_study_goal using errcode = '22023';
    end if;

    v_focus := coalesce(p_focus_minutes, 25);
    if v_focus not in (15, 25, 45) then
      raise exception 'Invalid focus minutes: %', p_focus_minutes using errcode = '22023';
    end if;
  end if;

  select * into v_row from private.student_preferences where user_id = v_uid for update;

  if found then
    -- Check monotonic terminal status
    if v_row.onboarding_status in ('completed', 'skipped') and v_action in ('complete', 'skip') then
      return jsonb_build_object(
        'primarySubject', v_row.primary_subject,
        'studyGoal', v_row.study_goal,
        'focusMinutes', v_row.focus_minutes,
        'onboardingStatus', v_row.onboarding_status,
        'onboardingVersion', v_row.onboarding_version,
        'completedAt', v_row.completed_at
      );
    end if;

    if v_action = 'complete' then
      update private.student_preferences
      set primary_subject = v_subj,
          study_goal = v_goal,
          focus_minutes = v_focus,
          onboarding_status = 'completed',
          completed_at = coalesce(v_row.completed_at, v_now),
          updated_at = v_now
      where user_id = v_uid
      returning * into v_row;
    elsif v_action = 'skip' then
      update private.student_preferences
      set primary_subject = null,
          study_goal = null,
          focus_minutes = 25,
          onboarding_status = 'skipped',
          completed_at = null,
          updated_at = v_now
      where user_id = v_uid
      returning * into v_row;
    else -- save
      update private.student_preferences
      set primary_subject = v_subj,
          study_goal = v_goal,
          focus_minutes = v_focus,
          updated_at = v_now
      where user_id = v_uid
      returning * into v_row;
    end if;
  else
    if v_action = 'complete' then
      insert into private.student_preferences (
        user_id, primary_subject, study_goal, focus_minutes, onboarding_status, onboarding_version, completed_at, created_at, updated_at
      ) values (
        v_uid, v_subj, v_goal, v_focus, 'completed', 1, v_now, v_now, v_now
      ) returning * into v_row;
    elsif v_action = 'skip' then
      insert into private.student_preferences (
        user_id, primary_subject, study_goal, focus_minutes, onboarding_status, onboarding_version, completed_at, created_at, updated_at
      ) values (
        v_uid, null, null, 25, 'skipped', 1, null, v_now, v_now
      ) returning * into v_row;
    else -- save
      insert into private.student_preferences (
        user_id, primary_subject, study_goal, focus_minutes, onboarding_status, onboarding_version, completed_at, created_at, updated_at
      ) values (
        v_uid, v_subj, v_goal, v_focus, 'pending', 1, null, v_now, v_now
      ) returning * into v_row;
    end if;
  end if;

  return jsonb_build_object(
    'primarySubject', v_row.primary_subject,
    'studyGoal', v_row.study_goal,
    'focusMinutes', v_row.focus_minutes,
    'onboardingStatus', v_row.onboarding_status,
    'onboardingVersion', v_row.onboarding_version,
    'completedAt', v_row.completed_at
  );
end;
$$;

revoke all on function public.save_student_preferences(text, text, integer, text) from public;
grant execute on function public.save_student_preferences(text, text, integer, text) to authenticated, service_role;
