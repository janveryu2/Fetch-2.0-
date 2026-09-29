-- ============================================================================
-- Migration: 20260926090100_repair_live_lifecycle.sql
-- Description: Restores canonical live room creation transaction (status='lobby',
--              host membership, private question snapshotting) and fixes maintenance
--              cleanup to use created_at on friend_requests and status='complete' on live_rooms.
-- ============================================================================

-- 1. Restore public.create_live_room
create or replace function public.create_live_room(
  p_pack_id uuid,
  p_artifact_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pack record;
  v_artifact record;
  v_room_id uuid := pg_catalog.gen_random_uuid();
  v_join_code text;
  v_mc_count integer := 0;
  v_char_pool text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i integer;
  v_q record;
  v_pos integer := 0;
  v_correct_idx integer := 0;
  v_idx integer;
  v_opt_text text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Verify pack ownership
  select * into v_pack
  from public.study_packs
  where id = p_pack_id and owner_id = v_uid;

  if not found then
    raise exception 'StudyPack not found or not owned' using errcode = '42501';
  end if;

  -- Verify artifact ownership if artifact_id provided
  if p_artifact_id is not null then
    select * into v_artifact
    from public.study_artifacts
    where id = p_artifact_id and pack_id = p_pack_id and owner_id = v_uid;

    if not found then
      raise exception 'Artifact not found or not owned' using errcode = '42501';
    end if;

    select count(*) into v_mc_count
    from public.questions
    where artifact_id = p_artifact_id and owner_id = v_uid and kind = 'multiple_choice';
  else
    select count(*) into v_mc_count
    from public.questions
    where pack_id = p_pack_id and owner_id = v_uid and kind = 'multiple_choice';
  end if;

  if v_mc_count = 0 then
    raise exception 'Live competition requires at least one multiple-choice question' using errcode = '40001';
  end if;

  -- Generate unique collision-safe 6-char alphanumeric join code
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

  -- Insert live room with canonical status 'lobby'
  insert into public.live_rooms (
    id, host_id, pack_id, artifact_id, join_code, status, question_count, current_question_index, version
  ) values (
    v_room_id, v_uid, p_pack_id, p_artifact_id, v_join_code, 'lobby', v_mc_count, 0, 1
  );

  -- Insert host as first member
  insert into public.live_room_members (room_id, user_id, score)
  values (v_room_id, v_uid, 0);

  -- Snapshot questions and answers into private.live_room_questions
  for v_q in
    select q.id, q.prompt, coalesce(q.choices, '[]'::jsonb) as choices, qk.answer, qk.explanation
    from public.questions q
    left join private.question_keys qk on qk.question_id = q.id
    where (case when p_artifact_id is not null then q.artifact_id = p_artifact_id else q.pack_id = p_pack_id end)
      and q.kind = 'multiple_choice'
    order by q.position asc
  loop
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
    'artifactId', p_artifact_id,
    'status', 'lobby',
    'questionCount', v_mc_count
  );
end;
$$;

revoke all on function public.create_live_room(uuid, uuid) from public, anon;
grant execute on function public.create_live_room(uuid, uuid) to authenticated, service_role;

-- 2. Repair maintenance function cleanup_expired_records
create or replace function public.cleanup_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
  v_drafts_deleted integer := 0;
  v_requests_deleted integer := 0;
  v_rooms_finished integer := 0;
begin
  if v_caller_role is distinct from 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Only server operations may run maintenance cleanup' using errcode = '42501';
  end if;

  -- Delete expired drafts (> 7 days)
  delete from public.study_session_drafts
  where updated_at < now() - interval '7 days';
  get diagnostics v_drafts_deleted = row_count;

  -- Delete expired friend requests (> 30 days) using created_at
  delete from public.friend_requests
  where status = 'pending' and created_at < now() - interval '30 days';
  get diagnostics v_requests_deleted = row_count;

  -- Finish expired live rooms (> 24 hours) using canonical status 'complete'
  update public.live_rooms
  set status = 'complete'
  where status in ('lobby', 'active') and created_at < now() - interval '24 hours';
  get diagnostics v_rooms_finished = row_count;

  return jsonb_build_object(
    'draftsDeleted', v_drafts_deleted,
    'requestsDeleted', v_requests_deleted,
    'roomsFinished', v_rooms_finished
  );
end;
$$;

revoke all on function public.cleanup_expired_records() from public, anon, authenticated;
grant execute on function public.cleanup_expired_records() to postgres, service_role;
