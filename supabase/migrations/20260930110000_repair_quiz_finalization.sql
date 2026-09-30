-- Match quiz finalization to private.question_keys, which is keyed by question_id.
-- This preserves quota reservation, idempotency, and artifact creation behavior.

-- 4. RPC: private.atomic_finalize_generation_job
create or replace function private.atomic_finalize_generation_job(
  p_job_id uuid,
  p_questions jsonb default '[]'::jsonb,
  p_summary jsonb default null,
  p_flashcards jsonb default '[]'::jsonb,
  p_parent_pack_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_job record;
  v_pack_id uuid;
  v_artifact_id uuid := pg_catalog.gen_random_uuid();
  v_source_text text;
  v_content_hash text;
  v_item jsonb;
  v_position integer;
  v_kind text;
  v_prompt text;
  v_answer text;
  v_explanation text;
  v_source_quote text;
  v_choices jsonb;
  v_question_id uuid;
  v_front text;
  v_back text;
  v_aliases text[];
  v_usage record;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may finalize generation jobs' using errcode = '42501';
  end if;

  -- 1. Lock job row FOR UPDATE
  select * into v_job
  from private.generation_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Generation job not found' using errcode = 'P0002';
  end if;

  -- Idempotency: repeated finalize calls return completed pack/artifact without double-committing
  if v_job.status = 'completed' then
    return jsonb_build_object(
      'jobId', v_job.id,
      'status', 'completed',
      'packId', v_job.pack_id,
      'artifactId', v_job.artifact_id,
      'reused', true
    );
  end if;

  if v_job.status in ('failed', 'cancelled') then
    raise exception 'Cannot finalize a % job', v_job.status using errcode = '22000';
  end if;

  -- 2. Fetch raw source content
  select source_content into v_source_text
  from private.generation_job_inputs
  where job_id = p_job_id;

  if v_source_text is null or char_length(v_source_text) = 0 then
    v_source_text := v_job.title;
  end if;

  v_content_hash := encode(extensions.digest(v_source_text, 'sha256'), 'hex');

  -- 3. Determine or create parent study pack
  if p_parent_pack_id is not null then
    select id into v_pack_id
    from public.study_packs
    where id = p_parent_pack_id and owner_id = v_job.owner_id;
    if not found then
      raise exception 'Specified parent study pack not found or not owned' using errcode = '42501';
    end if;
  else
    v_pack_id := pg_catalog.gen_random_uuid();
    insert into public.study_packs (
      id, owner_id, title, source_type, source_label, status
    ) values (
      v_pack_id, v_job.owner_id, v_job.title, v_job.source_type, v_job.source_label, 'ready'
    );
  end if;

  -- 4. Insert study artifact
  insert into public.study_artifacts (
    id, pack_id, owner_id, kind, origin, status, title, version
  ) values (
    v_artifact_id, v_pack_id, v_job.owner_id, v_job.artifact_kind, 'generated', 'ready', v_job.title, 1
  );

  -- 5. If quiz questions provided, insert questions and keys
  if jsonb_typeof(p_questions) = 'array' and jsonb_array_length(p_questions) > 0 then
    for v_item, v_position in
      select item, (ordinality - 1)::integer
      from pg_catalog.jsonb_array_elements(p_questions) with ordinality as question(item, ordinality)
    loop
      v_kind := coalesce(v_item->>'kind', v_item->>'type', 'multiple_choice');
      v_prompt := pg_catalog.btrim(v_item->>'prompt');
      v_answer := pg_catalog.btrim(v_item->>'answer');
      v_explanation := coalesce(v_item->>'explanation', '');
      v_source_quote := coalesce(v_item->>'sourceQuote', '');
      v_choices := coalesce(v_item->'choices', '[]'::jsonb);

      v_question_id := pg_catalog.gen_random_uuid();

      insert into public.questions (
        id, pack_id, artifact_id, owner_id, position, kind, prompt, choices
      ) values (
        v_question_id, v_pack_id, v_artifact_id, v_job.owner_id, v_position, v_kind, v_prompt, v_choices
      );

      insert into private.question_keys (
        question_id, owner_id, answer, explanation, source_quote
      ) values (
        v_question_id, v_job.owner_id, v_answer, v_explanation, v_source_quote
      );
    end loop;
  end if;

  -- 6. If structured summary provided, insert into private.summary_content
  if p_summary is not null and jsonb_typeof(p_summary) = 'object' then
    insert into private.summary_content (
      artifact_id, owner_id, schema_version, content
    ) values (
      v_artifact_id, v_job.owner_id, 1, p_summary
    );
  end if;

  -- 7. If flashcards provided, insert into public.flashcards
  if jsonb_typeof(p_flashcards) = 'array' and jsonb_array_length(p_flashcards) > 0 then
    for v_item, v_position in
      select item, (ordinality - 1)::integer
      from pg_catalog.jsonb_array_elements(p_flashcards) with ordinality as card(item, ordinality)
    loop
      v_front := pg_catalog.btrim(coalesce(v_item->>'front', ''));
      v_back := pg_catalog.btrim(coalesce(v_item->>'back', ''));
      v_source_quote := coalesce(v_item->>'sourceQuote', null);

      v_aliases := array[]::text[];
      if jsonb_typeof(v_item->'aliases') = 'array' then
        select coalesce(array_agg(elem::text), array[]::text[])
        into v_aliases
        from jsonb_array_elements_text(v_item->'aliases') as elem;
      end if;

      if char_length(v_front) > 0 and char_length(v_back) > 0 then
        insert into public.flashcards (
          artifact_id, owner_id, position, front, back, aliases, origin, source_quote, version
        ) values (
          v_artifact_id, v_job.owner_id, v_position, v_front, v_back, v_aliases, 'generated', v_source_quote, 1
        );
      end if;
    end loop;
  end if;

  -- 8. Persist canonical source text into private.study_sources for Tutor retrieval
  insert into private.study_sources (
    pack_id, owner_id, content, content_hash
  ) values (
    v_pack_id, v_job.owner_id, v_source_text, v_content_hash
  )
  on conflict (pack_id) do update
    set content = excluded.content,
        content_hash = excluded.content_hash;

  -- 9. Link source documents if PDF or Scan
  if v_job.source_type = 'pdf' then
    update private.source_documents
    set linked_pack_id = v_pack_id
    where owner_id = v_job.owner_id
      and (linked_pack_id is null or linked_pack_id = v_pack_id)
      and content_hash = v_content_hash;
  elsif v_job.source_type = 'scan' then
    update private.scan_documents
    set pack_id = v_pack_id
    where owner_id = v_job.owner_id
      and (pack_id is null or pack_id = v_pack_id);
  end if;

  -- 10. Atomically convert reservation to committed usage using original job month_key
  select * into v_usage
  from private.monthly_ai_usage
  where owner_id = v_job.owner_id and month_key = v_job.month_key
  for update;

  if not found then
    insert into private.monthly_ai_usage (owner_id, month_key, reserved_count, committed_count, updated_at)
    values (v_job.owner_id, v_job.month_key, 0, 1, now());
  else
    if v_usage.reserved_count <= 0 then
      raise exception 'Reservation inconsistency: reserved_count is zero' using errcode = '55000';
    end if;

    update private.monthly_ai_usage
    set reserved_count = v_usage.reserved_count - 1,
        committed_count = v_usage.committed_count + 1,
        updated_at = now()
    where owner_id = v_job.owner_id and month_key = v_job.month_key;
  end if;

  -- 11. Mark job completed
  update private.generation_jobs
  set status = 'completed',
      stage = 'completed',
      pack_id = v_pack_id,
      artifact_id = v_artifact_id,
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'jobId', p_job_id,
    'status', 'completed',
    'packId', v_pack_id,
    'artifactId', v_artifact_id,
    'reused', false
  );
end;
$$;

revoke all on function private.atomic_finalize_generation_job(uuid, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function private.atomic_finalize_generation_job(uuid, jsonb, jsonb, jsonb, uuid) to postgres, service_role;


notify pgrst, 'reload schema';
