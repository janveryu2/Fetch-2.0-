-- Migration: 20260926010000_repair_contracts_and_live_schema.sql
-- Description: Phase 1 repairs for Live room creation schema, source document extraction status, and contract alignments

-- 1. Relax extraction_status check on private.source_documents to accommodate both 'extracted' and 'processed'
alter table private.source_documents
  drop constraint if exists source_documents_extraction_status_check;

alter table private.source_documents
  add constraint source_documents_extraction_status_check
  check (extraction_status in ('pending', 'extracted', 'processed', 'failed'));

-- 2. Repair create_live_room to remove non-existent study_packs.visibility column and enforce owner-only room hosting
create or replace function public.create_live_room(p_pack_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room_id uuid;
  v_join_code text;
  v_q_count int;
  v_char_pool text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
  v_q record;
  v_pos int := 0;
  v_correct_idx int;
  v_opt_text text;
  v_idx int;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  -- Validate study pack exists and caller is the owner
  if not exists (
    select 1 from public.study_packs
    where id = p_pack_id and owner_id = v_caller
  ) then
    raise exception 'Study pack not found or access denied.';
  end if;

  -- Verify questions exist
  select count(*) into v_q_count from public.questions where pack_id = p_pack_id;
  if v_q_count = 0 then
    raise exception 'Cannot create a live room for a study pack with no questions.';
  end if;

  -- Generate unique 6-character room code
  loop
    v_join_code := '';
    for v_i in 1..6 loop
      v_join_code := v_join_code || substr(v_char_pool, floor(random() * length(v_char_pool) + 1)::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.live_rooms
      where join_code = v_join_code and status in ('lobby', 'active')
    );
  end loop;

  -- Insert live room
  insert into public.live_rooms (
    host_id, pack_id, join_code, status, question_count, current_question_index, version
  ) values (
    v_caller, p_pack_id, v_join_code, 'lobby', v_q_count, 0, 1
  ) returning id into v_room_id;

  -- Add host as member
  insert into public.live_room_members (room_id, user_id, score)
  values (v_room_id, v_caller, 0);

  -- Snapshot questions and secure keys into private.live_room_questions
  for v_q in
    select q.id, q.prompt, coalesce(q.choices, '[]'::jsonb) as choices, qk.answer, qk.explanation
    from public.questions q
    left join private.question_keys qk on qk.question_id = q.id
    where q.pack_id = p_pack_id
    order by q.position asc
  loop
    -- Determine correct choice index
    v_correct_idx := 0;
    if jsonb_array_length(v_q.choices) > 0 then
      for v_idx in 0..(jsonb_array_length(v_q.choices) - 1) loop
        v_opt_text := v_q.choices->>v_idx;
        if lower(trim(v_opt_text)) = lower(trim(v_q.answer)) then
          v_correct_idx := v_idx;
          exit;
        end if;
      end loop;
    end if;

    insert into private.live_room_questions (
      room_id, question_index, prompt, options, correct_option_index, explanation
    ) values (
      v_room_id, v_pos, v_q.prompt, v_q.choices, v_correct_idx, v_q.explanation
    );

    v_pos := v_pos + 1;
  end loop;

  return jsonb_build_object(
    'roomId', v_room_id,
    'joinCode', v_join_code,
    'packId', p_pack_id,
    'status', 'lobby',
    'questionCount', v_q_count
  );
end;
$$;

revoke execute on function public.create_live_room(uuid) from public;
grant execute on function public.create_live_room(uuid) to authenticated, service_role;
