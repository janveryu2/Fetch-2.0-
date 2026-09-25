-- Migration: 20260925300000_performance_and_security_hardening.sql
-- Phase 13: Security, performance, and observability hardening

-- 1. Performance and Query-Driven Indexes
create index if not exists idx_live_rooms_host_status on public.live_rooms(host_id, status);
create index if not exists idx_live_rooms_join_code on public.live_rooms(join_code);
create index if not exists idx_live_room_members_composite on public.live_room_members(room_id, user_id);
create index if not exists idx_live_room_questions_composite on public.live_room_questions(room_id, question_index);
create index if not exists idx_live_room_answers_composite on public.live_room_answers(room_id, question_index);
create index if not exists idx_friend_requests_composite on public.friend_requests(sender_id, recipient_id);
create index if not exists idx_calendar_events_user_starts on public.calendar_events(user_id, starts_at);

-- 2. Maintenance and Lazy Cleanup Function
create or replace function public.cleanup_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drafts_count integer := 0;
  v_rooms_count integer := 0;
  v_stale_requests integer := 0;
begin
  -- 1. Remove expired study session drafts
  with deleted_drafts as (
    delete from public.study_session_drafts
    where expires_at < now()
    returning id
  )
  select count(*) into v_drafts_count from deleted_drafts;

  -- 2. Mark abandoned or expired live rooms as finished
  with updated_rooms as (
    update public.live_rooms
    set status = 'finished'
    where status in ('waiting', 'active')
      and (expires_at < now() or created_at < now() - interval '24 hours')
    returning id
  )
  select count(*) into v_rooms_count from updated_rooms;

  -- 3. Expire stale pending friend requests (> 30 days old)
  with deleted_requests as (
    delete from public.friend_requests
    where status = 'pending'
      and created_at < now() - interval '30 days'
    returning id
  )
  select count(*) into v_stale_requests from deleted_requests;

  return jsonb_build_object(
    'cleanedDrafts', v_drafts_count,
    'closedRooms', v_rooms_count,
    'cleanedFriendRequests', v_stale_requests,
    'timestamp', now()
  );
end;
$$;

revoke all on function public.cleanup_expired_records() from public;
grant execute on function public.cleanup_expired_records() to authenticated, service_role;
