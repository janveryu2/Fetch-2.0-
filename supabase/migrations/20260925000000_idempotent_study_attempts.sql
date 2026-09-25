-- Migration: 20260925000000_idempotent_study_attempts.sql
-- Enables idempotent study attempt completion using client_attempt_id

alter table public.study_sessions
  add column if not exists client_attempt_id uuid;

create unique index if not exists study_sessions_user_client_attempt_id_idx
  on public.study_sessions (user_id, client_attempt_id)
  where client_attempt_id is not null;

create or replace function private.complete_study_attempt(
  p_pack_id uuid,
  p_answers jsonb,
  p_client_attempt_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_question_count integer;
  v_correct_count integer;
  v_attempt_id uuid;
  v_completed_at timestamptz;
  v_existing_score integer;
begin
  if v_owner is null or not exists (
    select 1 from public.study_packs where id = p_pack_id and owner_id = v_owner and status = 'ready'
  ) then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;

  -- Idempotency check: if client_attempt_id already exists for this user, return original attempt
  if p_client_attempt_id is not null then
    select s.id, s.completed_at, s.score, s.correct_count, s.question_count
    into v_attempt_id, v_completed_at, v_existing_score, v_correct_count, v_question_count
    from public.study_sessions as s
    where s.user_id = v_owner and s.client_attempt_id = p_client_attempt_id;

    if found then
      return pg_catalog.jsonb_build_object(
        'id', v_attempt_id,
        'packId', p_pack_id,
        'score', v_existing_score,
        'correct', v_correct_count,
        'total', v_question_count,
        'completedAt', v_completed_at
      );
    end if;
  end if;

  if pg_catalog.jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Invalid answers' using errcode = '22023';
  end if;
  select pg_catalog.count(*)::integer into v_question_count
  from public.questions where pack_id = p_pack_id and owner_id = v_owner;
  if v_question_count = 0 or pg_catalog.jsonb_array_length(p_answers) <> v_question_count then
    raise exception 'Submit one answer per question' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
    where submitted.question_id is null
      or submitted.answer is null
      or pg_catalog.char_length(pg_catalog.btrim(submitted.answer)) not between 1 and 1000
      or not exists (
        select 1 from public.questions as question
        where question.id = submitted.question_id
          and question.pack_id = p_pack_id
          and question.owner_id = v_owner
      )
  ) or exists (
    select submitted.question_id
    from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
    group by submitted.question_id having pg_catalog.count(*) <> 1
  ) then
    raise exception 'Answers do not match this StudyPack' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer into v_correct_count
  from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
  join public.questions as question
    on question.id = submitted.question_id and question.pack_id = p_pack_id and question.owner_id = v_owner
  join private.question_keys as answer_key
    on answer_key.question_id = question.id and answer_key.owner_id = v_owner
  where pg_catalog.lower(pg_catalog.btrim(submitted.answer)) = pg_catalog.lower(pg_catalog.btrim(answer_key.answer));

  insert into public.study_sessions (user_id, pack_id, client_attempt_id, score, correct_count, question_count)
  values (v_owner, p_pack_id, p_client_attempt_id, pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer, v_correct_count, v_question_count)
  returning id, completed_at into v_attempt_id, v_completed_at;

  return pg_catalog.jsonb_build_object(
    'id', v_attempt_id,
    'packId', p_pack_id,
    'score', pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer,
    'correct', v_correct_count,
    'total', v_question_count,
    'completedAt', v_completed_at
  );
end;
$$;

create or replace function public.complete_study_attempt(
  p_pack_id uuid,
  p_answers jsonb,
  p_client_attempt_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.complete_study_attempt(p_pack_id, p_answers, p_client_attempt_id); $$;
