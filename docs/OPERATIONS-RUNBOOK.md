# FETCH Backend Operations & Maintenance Runbook

This runbook guides ongoing backend operations, incident response, scheduled maintenance, and disaster recovery for the FETCH student-learning platform.

---

## 1. Routine Maintenance & Automated Cleanup

### 1.1 Invoking Cleanup for Expired Records
A database function `public.cleanup_expired_records()` is available to prune stale temporary data:
- Removes expired study session drafts (`expires_at < now()`).
- Automatically transitions abandoned live competition rooms to `finished` status if older than 24 hours.
- Prunes stale pending friend requests older than 30 days.

**Execution Options:**
1. **Supabase Cron (`pg_cron`):**
   ```sql
   select cron.schedule(
     'fetch-nightly-maintenance',
     '0 3 * * *', -- Run daily at 03:00 UTC
     'select public.cleanup_expired_records();'
   );
   ```
2. **Manual Invocation via SQL Editor or Service Role:**
   ```sql
   select public.cleanup_expired_records();
   ```

---

## 2. Incident Response Playbooks

### 2.1 Gemini AI Provider Outages
- **Symptom:** User sees `PROVIDER_UNAVAILABLE` or `GENERATION_FAILED` errors on `/api/generate`.
- **System Behavior:**
  - Reservations are automatically released via `release_ai_reservation`.
  - Monthly quota is NOT deducted for failed generation requests.
- **Operator Actions:**
  1. Check Google AI Studio status dashboard.
  2. Verify API key quota or billing limits on the Google Cloud Console.
  3. If necessary, switch models in environment (`GEMINI_STUDYPACK_MODEL`).

### 2.2 Groq Tutor Provider Outages
- **Symptom:** AI Tutor chat fails to stream or returns 503.
- **System Behavior:** Client displays reconnection message without crashing study session.
- **Operator Actions:**
  1. Check Groq platform status.
  2. Rotate or verify `GROQ_API_KEY`.
  3. Fallback tutor responses can be routed to alternative models via `GROQ_TUTOR_MODEL`.

### 2.3 Database Latency or Connection Exhaustion
- **Symptom:** HTTP 500 or `STORAGE_UNAVAILABLE` across endpoints.
- **System Behavior:** API returns structured error codes and logs error context.
- **Operator Actions:**
  1. Inspect Supabase dashboard metrics (Active Connections, CPU, Disk I/O).
  2. Ensure connection pooling (Supavisor / transaction pooler on port 6543) is enabled for serverless deployments.
  3. Verify recent queries against added performance indexes:
     - `idx_live_rooms_host_status`
     - `idx_live_room_members_composite`
     - `sessions_user_completed_idx`

---

## 3. Account Deletion & Data Privacy Audit

### 3.1 Verification of Complete User Deletion
When a user requests account deletion via `/api/account/delete`:
1. `deleteUserAccountServer` removes all files under `study-sources/{userId}/*` from Supabase Storage.
2. `auth.admin.deleteUser(userId)` deletes the Auth user record.
3. PostgreSQL foreign key `ON DELETE CASCADE` triggers cascading deletion across:
   - `profiles`
   - `study_packs`, `study_sources`, `questions`, `question_keys`
   - `study_sessions`, `study_session_answers`, `study_session_drafts`
   - `calendar_events`
   - `friendships`, `friend_requests`
   - `conversations`, `messages`, `conversation_members`
   - `account_preferences`
   - `generation_requests`

### 3.2 Audit Query
To verify that no orphaned records remain for a deleted user UUID:
```sql
select 'study_packs' as tbl, count(*) from public.study_packs where owner_id = '<user_id>'
union all
select 'study_sessions', count(*) from public.study_sessions where user_id = '<user_id>'
union all
select 'calendar_events', count(*) from public.calendar_events where user_id = '<user_id>';
```
(Expected result: 0 rows in all counts).

---

## 4. Secret & Credential Rotation Procedures

### 4.1 Supabase Service Role Key Rotation
1. Generate new service role key in Supabase Project Settings.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in environment (Vercel / production host).
3. Trigger application redeployment.
4. Revoke previous service role key in Supabase console.

### 4.2 AI Provider Keys (`GEMINI_API_KEY`, `GROQ_API_KEY`)
1. Generate new API key in provider console.
2. Update environment variable in hosting dashboard.
3. Redeploy application without database migrations or downtime.
