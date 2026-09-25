-- Migration: Live Competition with Synchronized Play & Authoritative Scoring
-- Sets up live_rooms lifecycle, members, questions snapshot, answers, and RPCs.

-- 1. Update public.live_rooms
alter table public.live_rooms add column if not exists current_question_index int not null default 0;
alter table public.live_rooms add column if not exists question_count int not null default 0;
alter table public.live_rooms add column if not exists version int not null default 1;
alter table public.live_rooms add column if not exists expires_at timestamptz not null default (now() + interval '2 hours');
alter table public.live_rooms add column if not exists completed_at timestamptz default null;

-- 2. Room Members Table
create table if not exists public.live_room_members (
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  score int not null default 0,
  primary key (room_id, user_id)
);

create index if not exists live_room_members_user_idx on public.live_room_members(user_id);

-- 3. Private Room Questions Snapshot Table
create table if not exists private.live_room_questions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  question_index int not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_option_index int not null default 0,
  explanation text,
  unique (room_id, question_index)
);

-- 4. Room Answers Table
create table if not exists public.live_room_answers (
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_index int not null,
  selected_index int not null,
  is_correct boolean not null,
  points_awarded int not null default 0,
  answered_at timestamptz not null default now(),
  primary key (room_id, user_id, question_index)
);

-- 5. Enable RLS
alter table public.live_room_members enable row level security;
alter table private.live_room_questions enable row level security;
alter table public.live_room_answers enable row level security;

-- Drop prior policies if exist
drop policy if exists "rooms_read_members" on public.live_rooms;
drop policy if exists "members_read_members" on public.live_room_members;
drop policy if exists "answers_read_members" on public.live_room_answers;

-- Read policies: only hosts and joined members can read room data
create policy "rooms_read_members" on public.live_rooms
  for select to authenticated
  using (
    host_id = (select auth.uid()) or
    id in (select room_id from public.live_room_members where user_id = (select auth.uid()))
  );

create policy "members_read_members" on public.live_room_members
  for select to authenticated
  using (
    room_id in (
      select id from public.live_rooms where host_id = (select auth.uid())
      union
      select room_id from public.live_room_members where user_id = (select auth.uid())
    )
  );

create policy "answers_read_members" on public.live_room_answers
  for select to authenticated
  using (
    user_id = (select auth.uid()) or
    room_id in (select id from public.live_rooms where host_id = (select auth.uid()))
  );

-- Revoke direct mutations on live competition tables
revoke insert, update, delete on public.live_rooms from authenticated, anon;
revoke insert, update, delete on public.live_room_members from authenticated, anon;
revoke insert, update, delete on public.live_room_answers from authenticated, anon;
revoke all on private.live_room_questions from authenticated, anon;

-- Grant select to authenticated
grant select on public.live_room_members, public.live_room_answers to authenticated, service_role;

-- 6. Add to Realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'live_rooms') then
      alter publication supabase_realtime add table public.live_rooms;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'live_room_members') then
      alter publication supabase_realtime add table public.live_room_members;
    end if;
  end if;
end $$;

-- 7. RPC: Create Live Room
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

  -- Validate study pack exists and caller has access
  if not exists (
    select 1 from public.study_packs
    where id = p_pack_id and (owner_id = v_caller or visibility = 'public')
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
    select q.id, q.prompt, q.choices, qk.answer, qk.explanation
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

-- 8. RPC: Join Live Room
create or replace function public.join_live_room(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select id, host_id, pack_id, status, expires_at into v_room
  from public.live_rooms
  where join_code = upper(trim(p_join_code));

  if v_room.id is null then
    raise exception 'Room not found with that code.';
  end if;

  if v_room.expires_at < now() then
    raise exception 'This live room has expired.';
  end if;

  if v_room.status = 'complete' then
    raise exception 'This live competition has already finished.';
  end if;

  -- Add to members
  insert into public.live_room_members (room_id, user_id, score)
  values (v_room.id, v_caller, 0)
  on conflict (room_id, user_id) do nothing;

  return jsonb_build_object(
    'roomId', v_room.id,
    'status', v_room.status,
    'packId', v_room.pack_id
  );
end;
$$;

revoke execute on function public.join_live_room(text) from public;
grant execute on function public.join_live_room(text) to authenticated, service_role;

-- 9. RPC: Start Live Game
create or replace function public.start_live_game(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> v_caller then
    raise exception 'Only the room host can start the game.';
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'Game has already started or ended.';
  end if;

  update public.live_rooms
  set status = 'active',
      current_question_index = 0,
      version = version + 1
  where id = p_room_id;

  return jsonb_build_object('success', true, 'status', 'active');
end;
$$;

revoke execute on function public.start_live_game(uuid) from public;
grant execute on function public.start_live_game(uuid) to authenticated, service_role;

-- 10. RPC: Submit Live Answer (Server Authoritative Scoring)
create or replace function public.submit_live_answer(
  p_room_id uuid,
  p_question_index int,
  p_selected_index int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
  v_q record;
  v_is_correct boolean;
  v_points int := 0;
  v_new_score int;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  -- Validate room
  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found.';
  end if;

  if v_room.status <> 'active' then
    raise exception 'Room is not currently accepting answers.';
  end if;

  if v_room.current_question_index <> p_question_index then
    raise exception 'Answer submitted for inactive question.';
  end if;

  -- Validate membership
  if not exists (
    select 1 from public.live_room_members where room_id = p_room_id and user_id = v_caller
  ) then
    raise exception 'You are not a participant in this room.';
  end if;

  -- Duplicate answer prevention
  if exists (
    select 1 from public.live_room_answers
    where room_id = p_room_id and user_id = v_caller and question_index = p_question_index
  ) then
    raise exception 'You have already answered this question.';
  end if;

  -- Query secret answer
  select * into v_q
  from private.live_room_questions
  where room_id = p_room_id and question_index = p_question_index;

  if v_q.id is null then
    raise exception 'Question not found.';
  end if;

  v_is_correct := (p_selected_index = v_q.correct_option_index);
  if v_is_correct then
    v_points := 100;
  end if;

  -- Insert answer record
  insert into public.live_room_answers (
    room_id, user_id, question_index, selected_index, is_correct, points_awarded
  ) values (
    p_room_id, v_caller, p_question_index, p_selected_index, v_is_correct, v_points
  );

  -- Increment user score
  update public.live_room_members
  set score = score + v_points
  where room_id = p_room_id and user_id = v_caller
  returning score into v_new_score;

  return jsonb_build_object(
    'isCorrect', v_is_correct,
    'correctIndex', v_q.correct_option_index,
    'pointsAwarded', v_points,
    'currentScore', v_new_score,
    'explanation', v_q.explanation
  );
end;
$$;

revoke execute on function public.submit_live_answer(uuid, int, int) from public;
grant execute on function public.submit_live_answer(uuid, int, int) to authenticated, service_role;

-- 11. RPC: Advance Live Question
create or replace function public.advance_live_question(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
  v_next_idx int;
  v_new_status text;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> v_caller then
    raise exception 'Only the host can advance questions.';
  end if;

  if v_room.status <> 'active' then
    raise exception 'Cannot advance question when room is not active.';
  end if;

  v_next_idx := v_room.current_question_index + 1;
  if v_next_idx >= v_room.question_count then
    -- Complete the competition
    update public.live_rooms
    set status = 'complete',
        completed_at = now(),
        version = version + 1
    where id = p_room_id;
    v_new_status := 'complete';
  else
    update public.live_rooms
    set current_question_index = v_next_idx,
        version = version + 1
    where id = p_room_id;
    v_new_status := 'active';
  end if;

  return jsonb_build_object(
    'status', v_new_status,
    'currentQuestionIndex', v_next_idx
  );
end;
$$;

revoke execute on function public.advance_live_question(uuid) from public;
grant execute on function public.advance_live_question(uuid) to authenticated, service_role;

-- 12. RPC: Get Live Room State
create or replace function public.get_live_room_state(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room record;
  v_pack_title text;
  v_members jsonb;
  v_question jsonb := null;
  v_my_answer record;
  v_q record;
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'Room not found.';
  end if;

  -- Validate caller is host or member
  if v_room.host_id <> v_caller and not exists (
    select 1 from public.live_room_members where room_id = p_room_id and user_id = v_caller
  ) then
    raise exception 'Access denied: not a member of this room.';
  end if;

  -- Fetch pack title
  select title into v_pack_title from public.study_packs where id = v_room.pack_id;

  -- Fetch leaderboard
  select coalesce(jsonb_agg(m_obj order by m_obj.score desc, m_obj."joinedAt" asc), '[]'::jsonb)
  into v_members
  from (
    select
      rm.user_id as "userId",
      rm.score,
      rm.joined_at as "joinedAt",
      (rm.user_id = v_room.host_id) as "isHost",
      (rm.user_id = v_caller) as "isMe",
      coalesce(p.display_name, 'Study Buddy') as "displayName",
      p.username,
      p.avatar_url as "avatarUrl"
    from public.live_room_members rm
    join public.profiles p on p.id = rm.user_id
    where rm.room_id = p_room_id
  ) m_obj;

  -- Fetch current question if active
  if v_room.status = 'active' then
    select * into v_q
    from private.live_room_questions
    where room_id = p_room_id and question_index = v_room.current_question_index;

    if v_q.id is not null then
      select selected_index, is_correct, points_awarded into v_my_answer
      from public.live_room_answers
      where room_id = p_room_id and user_id = v_caller and question_index = v_room.current_question_index;

      v_question := jsonb_build_object(
        'index', v_q.question_index,
        'prompt', v_q.prompt,
        'options', v_q.options,
        'myAnswer', case
          when v_my_answer.selected_index is not null then
            jsonb_build_object(
              'selectedIndex', v_my_answer.selected_index,
              'isCorrect', v_my_answer.is_correct,
              'pointsAwarded', v_my_answer.points_awarded
            )
          else null
        end,
        -- Only reveal correct answer and explanation if host or caller already answered!
        'correctIndex', case
          when v_my_answer.selected_index is not null or v_room.host_id = v_caller then v_q.correct_option_index
          else null
        end,
        'explanation', case
          when v_my_answer.selected_index is not null or v_room.host_id = v_caller then v_q.explanation
          else null
        end
      );
    end if;
  end if;

  return jsonb_build_object(
    'roomId', v_room.id,
    'hostId', v_room.host_id,
    'isHost', (v_room.host_id = v_caller),
    'packId', v_room.pack_id,
    'packTitle', coalesce(v_pack_title, 'Study Pack'),
    'joinCode', v_room.join_code,
    'status', v_room.status,
    'currentQuestionIndex', v_room.current_question_index,
    'questionCount', v_room.question_count,
    'version', v_room.version,
    'members', v_members,
    'currentQuestion', v_question
  );
end;
$$;

revoke execute on function public.get_live_room_state(uuid) from public;
grant execute on function public.get_live_room_state(uuid) to authenticated, service_role;
