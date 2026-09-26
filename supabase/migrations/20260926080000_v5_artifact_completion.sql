-- Migration: 20260926080000_v5_artifact_completion.sql
-- Description: Artifact-keyed study attempt completion, identification kind in persist_study_pack, and artifact CRUD

-- 1. Update private.persist_study_pack to support identification kind
create or replace function private.persist_study_pack(
  p_title text,
  p_source_type text,
  p_source_label text,
  p_source_content text,
  p_content_hash text,
  p_questions jsonb,
  p_owner_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_auth_uid uuid := (select auth.uid());
  v_owner uuid;
  v_pack_id uuid := pg_catalog.gen_random_uuid();
  v_artifact_id uuid := pg_catalog.gen_random_uuid();
  v_question_id uuid;
  v_item jsonb;
  v_position integer;
  v_kind text;
  v_prompt text;
  v_answer text;
  v_explanation text;
  v_source_quote text;
  v_choices jsonb;
  v_safe_questions jsonb := '[]'::jsonb;
begin
  if p_owner_id is not null then
    if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
      raise exception 'Only server operations may specify owner' using errcode = '42501';
    end if;
    v_owner := p_owner_id;
  else
    v_owner := v_auth_uid;
  end if;

  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = v_owner) then
    raise exception 'Owner not found' using errcode = '42501';
  end if;

  if p_title is null
    or p_source_type is null
    or p_source_label is null
    or p_source_content is null
    or p_content_hash is null
    or p_questions is null
    or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 80
    or p_source_type not in ('text', 'pdf', 'url', 'manual')
    or pg_catalog.char_length(pg_catalog.btrim(p_source_label)) not between 1 and 120
    or pg_catalog.char_length(p_source_content) not between 80 and 20000
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_questions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_questions) not between 3 and 20 then
    raise exception 'Invalid StudyPack' using errcode = '22023';
  end if;

  -- 1. Insert parent study pack
  insert into public.study_packs (id, owner_id, title, source_type, source_label, status)
  values (v_pack_id, v_owner, pg_catalog.btrim(p_title), p_source_type, pg_catalog.btrim(p_source_label), 'processing');

  -- 2. Insert primary quiz artifact
  insert into public.study_artifacts (id, pack_id, owner_id, kind, origin, status, title, version)
  values (v_artifact_id, v_pack_id, v_owner, 'quiz', 'generated', 'processing', pg_catalog.btrim(p_title), 1);

  -- 3. Insert questions linked to both pack and artifact
  for v_item, v_position in
    select item, (ordinality - 1)::integer
    from pg_catalog.jsonb_array_elements(p_questions) with ordinality as question(item, ordinality)
  loop
    v_kind := coalesce(v_item->>'kind', v_item->>'type');
    v_prompt := pg_catalog.btrim(v_item->>'prompt');
    v_answer := pg_catalog.btrim(v_item->>'answer');
    v_explanation := coalesce(pg_catalog.btrim(v_item->>'explanation'), '');
    v_source_quote := coalesce(pg_catalog.btrim(v_item->>'sourceQuote'), '');
    v_choices := coalesce(v_item->'choices', v_item->'options', '[]'::jsonb);

    if v_kind not in ('multiple_choice', 'fill_blank', 'identification')
      or pg_catalog.char_length(v_prompt) not between 3 and 600
      or pg_catalog.char_length(v_answer) not between 1 and 1000
      or pg_catalog.char_length(v_explanation) > 1000
      or pg_catalog.char_length(v_source_quote) > 1000
      or (v_kind = 'multiple_choice' and (
        pg_catalog.jsonb_typeof(v_choices) is distinct from 'array'
        or pg_catalog.jsonb_array_length(v_choices) not between 2 and 6
      )) then
      raise exception 'Invalid question structure' using errcode = '22023';
    end if;

    v_question_id := pg_catalog.gen_random_uuid();

    insert into public.questions (id, pack_id, artifact_id, owner_id, position, kind, prompt, choices)
    values (v_question_id, v_pack_id, v_artifact_id, v_owner, v_position, v_kind, v_prompt, v_choices);

    insert into private.question_keys (question_id, owner_id, answer, explanation, source_quote)
    values (v_question_id, v_owner, v_answer, v_explanation, v_source_quote);

    v_safe_questions := v_safe_questions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_question_id,
        'position', v_position,
        'kind', v_kind,
        'prompt', v_prompt,
        'choices', v_choices
      )
    );
  end loop;

  insert into private.study_sources (pack_id, owner_id, content, content_hash)
  values (
    v_pack_id,
    v_owner,
    p_source_content,
    p_content_hash
  );

  update public.study_packs set status = 'ready', updated_at = pg_catalog.now()
  where id = v_pack_id and owner_id = v_owner;

  update public.study_artifacts set status = 'ready', updated_at = pg_catalog.now()
  where id = v_artifact_id and owner_id = v_owner;

  return pg_catalog.jsonb_build_object(
    'id', v_pack_id,
    'packId', v_pack_id,
    'artifactId', v_artifact_id,
    'questions', v_safe_questions
  );
end;
$$;

-- 2. Update private.complete_study_attempt for artifact-scoped completion
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
  v_resolved_pack_id uuid;
  v_resolved_artifact_id uuid;
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

  -- 1. Resolve whether p_pack_id is an artifact ID or pack ID
  select a.id, a.pack_id into v_resolved_artifact_id, v_resolved_pack_id
  from public.study_artifacts a
  where a.id = p_pack_id and a.owner_id = v_owner and a.status = 'ready';

  if v_resolved_pack_id is null then
    select p.id into v_resolved_pack_id
    from public.study_packs p
    where p.id = p_pack_id
      and p.owner_id = v_owner
      and p.status = 'ready'
      and p.archived_at is null;

    if v_resolved_pack_id is not null then
      select a.id into v_resolved_artifact_id
      from public.study_artifacts a
      where a.pack_id = v_resolved_pack_id and a.owner_id = v_owner and a.kind = 'quiz' and a.status = 'ready'
      order by a.created_at desc limit 1;
    end if;
  end if;

  if v_resolved_pack_id is null then
    raise exception 'StudyPack not found or archived' using errcode = '42501';
  end if;

  -- 2. Idempotency check: if client_attempt_id already exists for this user
  select s.id, s.pack_id, s.completed_at, s.score, s.correct_count, s.question_count, s.request_hash
  into v_attempt_id, v_existing_pack_id, v_completed_at, v_existing_score, v_correct_count, v_question_count, v_existing_hash
  from public.study_sessions as s
  where s.user_id = v_owner and s.client_attempt_id = p_client_attempt_id;

  if found then
    if v_existing_pack_id <> v_resolved_pack_id or (v_existing_hash is not null and p_request_hash is not null and v_existing_hash <> p_request_hash) then
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

  -- 3. Validate answer payload structure
  if pg_catalog.jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Invalid answers format' using errcode = '22023';
  end if;

  -- Count questions scoped to the artifact (or pack if artifact is null)
  if v_resolved_artifact_id is not null then
    select pg_catalog.count(*)::integer into v_question_count
    from public.questions
    where artifact_id = v_resolved_artifact_id and owner_id = v_owner;
  else
    select pg_catalog.count(*)::integer into v_question_count
    from public.questions
    where pack_id = v_resolved_pack_id and owner_id = v_owner;
  end if;

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
          and (
            (v_resolved_artifact_id is not null and question.artifact_id = v_resolved_artifact_id)
            or (v_resolved_artifact_id is null and question.pack_id = v_resolved_pack_id)
          )
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
    on question.id = submitted.question_id
    and (
      (v_resolved_artifact_id is not null and question.artifact_id = v_resolved_artifact_id)
      or (v_resolved_artifact_id is null and question.pack_id = v_resolved_pack_id)
    )
    and question.owner_id = v_owner
  join private.question_keys as answer_key
    on answer_key.question_id = question.id and answer_key.owner_id = v_owner
  where pg_catalog.lower(pg_catalog.btrim(submitted.answer)) = pg_catalog.lower(pg_catalog.btrim(answer_key.answer));

  -- Insert session row with artifact_id
  begin
    insert into public.study_sessions (
      user_id,
      pack_id,
      artifact_id,
      client_attempt_id,
      request_hash,
      score,
      correct_count,
      question_count
    )
    values (
      v_owner,
      v_resolved_pack_id,
      v_resolved_artifact_id,
      p_client_attempt_id,
      p_request_hash,
      pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer,
      v_correct_count,
      v_question_count
    )
    returning id, completed_at into v_attempt_id, v_completed_at;
  exception
    when unique_violation then
      select s.id, s.pack_id, s.completed_at, s.score, s.correct_count, s.question_count
      into v_attempt_id, v_existing_pack_id, v_completed_at, v_existing_score, v_correct_count, v_question_count
      from public.study_sessions as s
      where s.user_id = v_owner and s.client_attempt_id = p_client_attempt_id;

      return pg_catalog.jsonb_build_object(
        'id', v_attempt_id,
        'packId', v_existing_pack_id,
        'score', v_existing_score,
        'correct', v_correct_count,
        'total', v_question_count,
        'completedAt', v_completed_at
      );
  end;

  return pg_catalog.jsonb_build_object(
    'id', v_attempt_id,
    'packId', v_resolved_pack_id,
    'artifactId', v_resolved_artifact_id,
    'score', pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer,
    'correct', v_correct_count,
    'total', v_question_count,
    'completedAt', v_completed_at
  );
end;
$$;
