# ANTIGRAVITY CORRECTION HANDOFF — FETCH V5

**Status: release blocked.** This is a correction handoff, not a redesign. Apply only the existing V5 requirements and defects listed below. Do not add features or relax privacy, grounding, quota, accessibility, or persistence invariants. Full evidence and severities: `docs/FETCH-V5-FINAL-ARCHITECTURE-REVIEW.md`.

## 1. Repair generation database wiring and finalization — BLOCKING

- Route server operations to the real private generation tables/RPCs through a narrowly granted trusted-server interface. The default public client cannot resolve them. Do not expose private sources/jobs/answer keys to browser roles.
- Repair four-argument finalizer: qualify `extensions.digest`, persist canonical source in `private.study_sources`, and link actual PDF/scan document records using their real columns. Remove obsolete overloads safely through forward migrations and synchronize `core.sql`.
- Verify start → status → worker → finalize for quiz, flashcards and summary against the actual migrated database. Each transaction must roll back artifact/source/quota/job together on injected failure.

## 2. Finish the approved durable worker — BLOCKING

- Replace unawaited request-local all-batch execution with the approved protected one-batch worker, fenced claim/lease, persisted accepted output and authenticated dispatch/recovery.
- Use `generation_job_batches`; resume after process termination and expired lease. Enforce one active job per owner and bounded project/provider concurrency.
- Persist/recover active job identity after browser reload. Reused requests must return/resume the existing result/job; cancellation must stop future batches and prevent finalization.
- Acceptance: kill after a checkpoint, expire/reclaim lease, deliver duplicate dispatch, cancel during provider call; exactly one correct artifact and charge, or no artifact/charge on failure/cancel.

## 3. Remove production fixtures and enforce generation contracts — BLOCKING

- Use Gemini for generated decks and summaries; fixture output is allowed only in clearly isolated demo/test code.
- Provider/config/grounding failure must not become charged fixture success.
- Add the planned coverage/topic allocation, hard count/quality/quote/page validation and cross/within-batch duplicate checks; bounded repair then failure without charge.
- Acceptance: sufficient source produces exactly 50 distinct grounded questions; insufficient source is rejected before reservation; malformed/duplicate/provider-error fixtures cannot finalize. Generated cards/summary genuinely use provider output and source evidence.

## 4. Correct quota and logical request idempotency — IMPORTANT

- Coordinate legacy and job quota paths through one atomic reservation/commit authority, enforcing allowance and owner concurrency under parallel starts.
- Send a stable request UUID and complete payload hash from the client across retries/reload; different payload/same key returns conflict. Preserve month semantics and release on failure/cancel.
- Acceptance: parallel starts at 14/15 used, duplicate requests, ambiguous network retry, repeated finalize, month rollover, and rollback injection cannot overrun allowance or double-charge one logical request.

## 5. Correct full-source PDF/Scan linkage — IMPORTANT

- Submit owned document IDs and resolve source on the server; do not generate from the 300-character PDF preview or trust arbitrary document references.
- Preserve full reviewed text/page provenance and canonical Tutor source. Reject over-limit material or require explicit section selection; remove silent truncation.
- Link scan/PDF documents to the saved pack/artifact transactionally.
- Acceptance: facts beyond preview and on later pages appear with correct evidence; cross-account document IDs fail; edited OCR text is authoritative after reload.

## 6. Finish artifact compatibility and quiz subtypes — IMPORTANT

- Complete artifact-keyed question positions, drafts, attempts, grading/completion/history and library selection. Enable multiple outputs under the owned parent pack rather than always creating a new parent.
- Keep legacy pack entry points/backfilled quiz data working through explicit artifact resolution.
- Add the specified multiple-choice/fill-blank/identification/mixed configuration through UI/API/provider/schema/grading. Live stays MC-only.
- Acceptance: two quiz artifacts in one pack have independent positions, drafts, completion and history; legacy pack/attempt fixtures survive upgrade; subtype selection persists and grades correctly.

## 7. Repair flashcard authoritative persistence and RLS — IMPORTANT

- Use one transactional locked attempt/session transition; validate owner, same artifact/card/version, active status, expected head and ordinal; replay a saved ordinal idempotently.
- Restrict client mutation of correctness/mastery/counters and enforce parent ownership on artifacts/cards/sessions/attempts. Remove owner-ID-only foreign-parent attachment paths.
- Resume actual saved session/queue/stats; Study Again starts a real server session. Never swallow save failures or claim offline mastery is persisted.
- Acceptance: reload resumes, concurrent/retried submissions reconcile, failed update cannot leave partial attempt, unrelated owned/foreign card is rejected, forged counters/parent links denied.

## 8. Finish already specified flashcard lifecycle — IMPORTANT

- Add saved card/deck editing/deletion with version change handling; creation-modal edits are not saved-deck editing.
- After three misses offer Continue or End incomplete; avoid endless forced retry and false mastery.
- Include persisted first-try and eventual mastery in Progress.
- Use existing accessible Dialog primitives, named close action, associated labels, focus trap/Escape/restoration and keyboard card controls.
- Acceptance: generated and manual deck flows D/E, saved CRUD, edit during session, one-card retry, incomplete exit, reload and two-account privacy all pass.

## 9. Repair Scan constraints, validation and cleanup — IMPORTANT

- Reorder transactionally without violating position CHECK/uniqueness; verify the actual SQL.
- Enforce real JPEG/PNG signatures, decode/pixel/resource/orientation checks, five pages, 5 MiB/page and 20 MiB total. Use approved owner-authorized direct Storage upload to avoid large serverless multipart bodies.
- Align replacement behavior with Storage policies; do not use unauthorized upsert.
- Clean abandoned objects/rows and scan objects on document/pack/account deletion, with explicit failure handling.
- Acceptance: real phone flow C, reorder, oversized/malformed/rotated images, cross-owner Storage access, replacement and cleanup all pass.

## 10. Bound Tutor context — IMPORTANT

- Subdivide oversized pages/paragraphs and enforce the hard source plus history prompt budget including the first chunk.
- Preserve Groq-only Tutor and shared safe Markdown rendering.
- Acceptance: 75k single paragraph/page and maximum-history fixtures remain within measured budget; relevant page/section evidence and unsafe HTML tests pass.

## 11. Close social and maintenance authorization gaps — IMPORTANT

- Enforce self/friend access in `get_friend_profile`; no stranger enumeration through the profile route. Preserve opt-in academic fields and self-only base profiles SELECT.
- Remove ambiguous Live creation overloads; resolve eligible artifact explicitly while supporting old pack callers through one clear adapter. Never snapshot fill-blank as MC answer index zero.
- Restrict `cleanup_expired_records` to intended trusted operations; remote anon currently has EXECUTE and the function lacks an authorization guard.
- Confirm DM preference wording: if advertised as ongoing message opt-out, enforce recipient preference in send; otherwise make wording match the implemented new-conversation gate.
- Acceptance: unrelated-account/anon negative tests, canonical direct-chat reuse, two-account message/Realtime reconnect, and complete server-scored flow J pass without key leakage.

## 12. Correct timer event identity — IMPORTANT

- Persist stable session/completion IDs; claim completion across tabs so reload/restore cannot replay sound/notification. Move audio side effects outside state updater and wire the specified completion bark alongside the completion cue when supplied audio is available.
- Keep denied/muted/unsupported notification cases usable; label missing bark/chime fallback truthfully and do not mark final bark quality accepted without supplied MP3s.
- Acceptance: background, reload at boundary, two tabs, rapid start/stop, mute/denied permissions each produce the intended once-only signals.

## 13. Close verification and release gates — IMPORTANT

- Fix `npm run lint` (5 errors) and 11 failing browser tests. Update stale selectors/tab ordering to current intended behavior; do not delete/skip assertions. Investigate mobile Messages heading visibility.
- Add meaningful migrated-SQL/RLS/transaction tests and mocked-provider authenticated A–J E2E. Replace vacuous Node-only sound tests with real provider lifecycle/browser tests. Keep existing XSS/queue/grading tests.
- Verify clean migration replay, real legacy fixture upgrade, schema parity, obsolete overload removal and rollback. All seven V5 migrations must be accounted for.
- Record staging provider/runtime limits, true A–J evidence, keyboard/axe/new-modal/mobile/real-phone checks and targeted provider/media smoke results.
- Establish deployed app URL, immutable deployment ID and Git SHA, environment capability state, remote migration ledger and critical production smoke. Database migration application alone does not establish deployment parity.
- Change checkpoint PASS/complete claims to failed/pending until evidence supports them; note missing MP3/external gates accurately.

## Required return package

1. Focused commits and forward migrations addressing the items above.
2. Updated checkpoint with actual commands/results and evidence for each repaired gate.
3. Typecheck, lint, build, unit/integration and desktop/mobile E2E results; no unexplained skips or suppressed failures.
4. Quota/lease/transaction failure-injection and two-account security evidence.
5. Schema/legacy/rollback/deployment identity verification.

Return for Codex review → Gemini repair → Codex verification. The current implementation is not approved for release. No new features or redesign are authorized by this handoff.
