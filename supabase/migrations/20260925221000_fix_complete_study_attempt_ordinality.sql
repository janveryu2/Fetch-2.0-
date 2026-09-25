-- Migration: 20260925221000_fix_complete_study_attempt_ordinality.sql
-- Fixes with ordinality syntax with jsonb_array_elements in complete_study_attempt

create or replace function private.complete_study_attempt(
  p_pack_id uuid,
  p_answers jsonb,
  p_client_attempt_id uuid default null,
  p_request_hash text default null
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
  v_existing_pack_id uuid;
  v_existing_hash text;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_client_attempt_id is null then
    raise exception 'client_attempt_id is required' using errcode = '22023';
  end if;

  -- Verify pack ownership and availability (must be ready and not archived)
  if not exists (
    select 1 from public.study_packs
    where id = p_pack_id
      and owner_id = v_owner
      and status = 'ready'
      and archived_at is null
  ) then
    raise exception 'StudyPack not found or archived' using errcode = '42501';
  end if;

  -- Idempotency check: if client_attempt_id already exists for this user
  select s.id, s.pack_id, s.completed_at, s.score, s.correct_count, s.question_count, s.request_hash
  into v_attempt_id, v_existing_pack_id, v_completed_at, v_existing_score, v_correct_count, v_question_count, v_existing_hash
  from public.study_sessions as s
  where s.user_id = v_owner and s.client_attempt_id = p_client_attempt_id;

  if found then
    -- Check for conflict: different packId or different requestHash
    if v_existing_pack_id <> p_pack_id or (v_existing_hash is not null and p_request_hash is not null and v_existing_hash <> p_request_hash) then
      raise exception 'Attempt conflict: client attempt ID reused with different parameters' using errcode = '23505';
    end if;

    return pg_catalog.jsonb_build_object(
      'id', v_attempt_id,
      'packId', v_existing_pack_id,
      'score', v_existing_score,
      'correct', v_correct_count,
      'total', v_question_count,
      'completedAt', v_completed_at
    );
  end if;

  -- Validate answer payload structure
  if pg_catalog.jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Invalid answers format' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer into v_question_count
  from public.questions
  where pack_id = p_pack_id and owner_id = v_owner;

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

  -- Grade answers server-side against private.question_keys
  select pg_catalog.count(*)::integer into v_correct_count
  from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
  join public.questions as question
    on question.id = submitted.question_id and question.pack_id = p_pack_id and question.owner_id = v_owner
  join private.question_keys as answer_key
    on answer_key.question_id = question.id and answer_key.owner_id = v_owner
  where pg_catalog.lower(pg_catalog.btrim(submitted.answer)) = pg_catalog.lower(pg_catalog.btrim(answer_key.answer));

  -- Insert session row
  begin
    insert into public.study_sessions (
      user_id,
      pack_id,
      client_attempt_id,
      request_hash,
      score,
      correct_count,
      question_count
    )
    values (
      v_owner,
      p_pack_id,
      p_client_attempt_id,
      p_request_hash,
      pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer,
      v_correct_count,
      v_question_count
    )
    returning id, completed_at into v_attempt_id, v_completed_at;
  exception
    when unique_violation then
      -- In case of concurrent race on (user_id, client_attempt_id)
      select s.id, s.pack_id, s.completed_at, s.score, s.correct_count, s.question_count, s.request_hash
      into v_attempt_id, v_existing_pack_id, v_completed_at, v_existing_score, v_correct_count, v_question_count, v_existing_hash
      from public.study_sessions as s
      where s.user_id = v_owner and s.client_attempt_id = p_client_attempt_id;

      if found then
        if v_existing_pack_id <> p_pack_id or (v_existing_hash is not null and p_request_hash is not null and v_existing_hash <> p_request_hash) then
          raise exception 'Attempt conflict: client attempt ID reused with different parameters' using errcode = '23505';
        end if;

        return pg_catalog.jsonb_build_object(
          'id', v_attempt_id,
          'packId', v_existing_pack_id,
          'score', v_existing_score,
          'correct', v_correct_count,
          'total', v_question_count,
          'completedAt', v_completed_at
        );
      end if;
      raise;
  end;

  -- Insert detailed per-answer rows into public.study_session_answers using jsonb_array_elements
  insert into public.study_session_answers (
    session_id,
    question_id,
    submitted_answer,
    is_correct,
    answered_at,
    ordinal
  )
  select
    v_attempt_id,
    (elem.val->>'question_id')::uuid,
    elem.val->>'answer',
    (pg_catalog.lower(pg_catalog.btrim(elem.val->>'answer')) = pg_catalog.lower(pg_catalog.btrim(answer_key.answer))),
    v_completed_at,
    coalesce(question.position, (elem.ord - 1)::integer)
  from pg_catalog.jsonb_array_elements(p_answers) with ordinality as elem(val, ord)
  join public.questions as question
    on question.id = (elem.val->>'question_id')::uuid and question.pack_id = p_pack_id and question.owner_id = v_owner
  join private.question_keys as answer_key
    on answer_key.question_id = question.id and answer_key.owner_id = v_owner;

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
