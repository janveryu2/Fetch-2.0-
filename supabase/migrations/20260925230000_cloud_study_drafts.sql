-- Migration: 20260925230000_cloud_study_drafts.sql
-- Phase 4: Local-first cloud drafts
-- Adds typed draft columns, fingerprint validation, and expiration to study_session_drafts.

alter table public.study_session_drafts
  add column if not exists client_attempt_id uuid default null,
  add column if not exists pack_fingerprint text default null,
  add column if not exists current_answer text not null default '',
  add column if not exists checked boolean not null default false,
  add column if not exists feedback jsonb default null,
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');

create index if not exists study_session_drafts_user_pack_expires_idx
  on public.study_session_drafts (user_id, pack_id, expires_at);
