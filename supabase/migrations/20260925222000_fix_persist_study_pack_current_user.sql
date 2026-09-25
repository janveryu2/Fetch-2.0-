-- Migration: 20260925222000_fix_persist_study_pack_current_user.sql
-- Fixes pg_catalog.current_user syntax in private.persist_study_pack

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
    or p_source_type not in ('text', 'pdf', 'url')
    or pg_catalog.char_length(pg_catalog.btrim(p_source_label)) not between 1 and 120
    or pg_catalog.char_length(p_source_content) not between 80 and 20000
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_questions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_questions) not between 3 and 20 then
    raise exception 'Invalid StudyPack' using errcode = '22023';
  end if;

  insert into public.study_packs (id, owner_id, title, source_type, source_label, status)
  values (v_pack_id, v_owner, pg_catalog.btrim(p_title), p_source_type, pg_catalog.btrim(p_source_label), 'processing');

  for v_item, v_position in
    select item, (ordinality - 1)::integer
    from pg_catalog.jsonb_array_elements(p_questions) with ordinality as question(item, ordinality)
  loop
    v_kind := v_item->>'type';
    v_prompt := pg_catalog.btrim(v_item->>'prompt');
    v_answer := pg_catalog.btrim(v_item->>'answer');
    v_explanation := coalesce(pg_catalog.btrim(v_item->>'explanation'), '');
    v_source_quote := coalesce(pg_catalog.btrim(v_item->>'sourceQuote'), '');
    v_choices := coalesce(v_item->'options', '[]'::jsonb);

    if v_kind not in ('multiple_choice', 'fill_blank')
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

    insert into public.questions (id, pack_id, owner_id, position, kind, prompt, choices)
    values (v_question_id, v_pack_id, v_owner, v_position, v_kind, v_prompt, v_choices);

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

  return pg_catalog.jsonb_build_object('id', v_pack_id, 'questions', v_safe_questions);
end;
$$;
