# FETCH V5 Final Architecture Review

**Verdict: NOT PASSED — release blocked.**

Reviewed September 26, 2026 against `FETCH_POLISH_LEARNING_EXPERIENCE_IMPLEMENTATION_PLAN.md`, including appendices A–F. Baseline: `4db14c5`; reviewed HEAD: `ee387b0`. Implementation commits `b31eabb` through `f13e0b5` exist separately, followed by the plan documentation commit. The working tree was clean at review start. No product code, migrations, production records, or configuration were changed by this review.

## Independent verification

| Check | Result |
|---|---|
| `npm test` | PASS: 34 files, 281 tests, no skipped unit tests. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run build` | PASS, compilation and 49/49 static-page generation steps completed. The build prints more than 49 total static/dynamic route entries; “49 routes” is not the same measurement. |
| `npm run lint` | FAIL: 5 errors, 14 warnings. |
| `npm run test:e2e` | FAIL: 36 passed, 11 failed, 1 skipped (48 cases, desktop/mobile, 6.3 minutes). Failures include intake keyboard navigation, legacy study action selectors, Tutor control expectation, and the mobile four-width surface test (Messages heading hidden). Some expectations are stale; this is still a failed regression gate and not A–J certification. |
| Remote Supabase read-only catalog | Connected through `supabase db query --linked`; confirmed applied migration versions, generation function schemas/overloads, Live overloads, source-document columns, pgcrypto schema, scan constraints, Storage policies, RLS flags and Realtime publication. |
| Remote `supabase db advisors --linked --type security` | Returned warnings; confirmed an unguarded maintenance function is executable by anon. Advisor warnings on authenticated SECURITY DEFINER functions are not automatically vulnerabilities; authorization bodies were reviewed separately. |
| `supabase migration list --linked` | Failed temp-role password authentication. Migration ledger was independently read through the working Management API SQL path. |
| Remote read-only PostgREST lookup | The application's default-schema lookup of `generation_jobs` returns HTTP 404 / `PGRST205`: `public.generation_jobs` is absent. |
| Secret scan | Scanned 28 reachable Git commits for Google/Groq/OpenAI/Supabase secret-token patterns; no candidate matches; a separate decoded JWT scan found no service-role JWT candidates. Only `.env.example` is tracked. This pattern scan is not a guarantee that every possible secret format is absent. |
| Production application identity | NOT VERIFIED: no deployed URL/immutable deployment ID/commit binding was established. Remote database access does not prove deployed application code equals HEAD. |

All remote operations were read-only. No live AI generations, account creation, quota charging, or user-content exports were used as verification shortcuts.

## BLOCKING findings

### B1. New generation cannot reach its database contracts

Evidence: `src/lib/server/privileged-supabase.ts:15` creates a default-schema client; `:407` calls `rpc("start_generation_job")`; `:494` calls `rpc("atomic_finalize_generation_job")`. `src/lib/ai/durable-generation.ts:307` reads `generation_jobs` and `:327` reads job inputs with the same default public schema. Migrations and the remote catalog define those functions/tables only in `private`; no public server-only wrapper was found. A read-only lookup using the configured service client reproduced `PGRST205` for `public.generation_jobs`.

Impact: the account generation entry path cannot start normally, and a hypothetical manually created job cannot run/finalize through this code. Service-role credentials do not change the client's target schema.

Required correction: connect server operations to the intended private contract through a narrowly granted server interface without granting browser access to private data. Verify the actual start/status/worker/finalize path against staging; helper mocks are insufficient.

### B2. Finalization is invalid even after schema wiring is repaired

Evidence: `supabase/migrations/20260926040000_flashcards_mastery.sql:380` uses `digest()` under `SET search_path = ''`; remote pgcrypto lives in `extensions`. At `:462–465` it inserts `pack_id`, `source_type`, and `source_content` into `private.source_documents`. The remote table has none of these columns: it uses `storage_path`, `file_size_bytes`, `extracted_text`, and `linked_pack_id`. Text study sources belong in `private.study_sources`. The current four-argument function also fails to insert the source row required by Tutor's `get_owned_study_source`.

Impact: all new artifact finalizations roll back. Fixing only B1 exposes this next failure. The three-argument predecessor remains deployed too, and the reference schema still contains that predecessor rather than the flashcard-aware finalizer.

Required correction: use the actual source schema, qualify extension functions, correctly link existing PDF/scan records, persist the canonical private study source, retire obsolete overloads safely, and execute each artifact-kind transaction against the migrated schema.

### B3. “Durable” generation has no durable execution or recovery

Evidence: `src/app/api/generate/job/route.ts:95–99` starts `runGenerationJob()` as an unawaited promise and returns the response; the route remains capped at 60 seconds. The runner loops all batches in one invocation. `generation_job_batches`, lease owner, expiry and fencing fields are defined in SQL but never used by the runner. Only accepted-count progress is saved; generated content stays in process memory. No protected batch worker, claim/checkpoint RPC, authenticated dispatch, Cron recovery, or bounded project/owner worker concurrency was found. Reused jobs are not dispatched again. UI job identity is component state only (`create-pack-panel.tsx:60–67`), so reload loses the active job.

Impact: process termination/timeouts lose work and leave jobs in progress with no recovery. No proof supports the checkpoint's durable/resumable claim.

Required correction: implement the already approved one-batch durable execution contract, persistent accepted batch output, fenced claims, recovery, cancellation acknowledgment, and reload resume. Inject process/lease failures to prove recovery and exactly-once finalization.

### B4. Production uses fixture generators and silently replaces AI failures

Evidence: `src/lib/ai/durable-generation.ts:340–348` calls `createFixtureSummary` whether a Gemini key exists or not. `:388–390` always calls `createFixtureBatchFlashcards`. `:473–489` converts provider/config/validation failure into fixture quiz questions instead of failing without charge. Summary definitions/relationships include generic invented text. There is no source-coverage gate, topic allocation pass, or required full-result count check before finalization. Within-batch deduplication compares candidates only against prior completed batches.

Impact: generated decks and summaries are not Gemini-generated; provider failure can produce a charged “success”; fewer than the requested 50 or duplicate questions can be marked ready. This contradicts flows A/D and source-grounded generation.

Required correction: keep fixtures in explicitly isolated test/demo paths, use validated Gemini generation for each supported artifact, reject insufficient coverage, enforce requested count and cross/within-batch uniqueness, perform only bounded repair, and fail/release without charging after exhausted validation/provider failures.

## IMPORTANT findings

### I1. Quota protection and request lifecycle are incomplete

`20260926030000_durable_large_generation.sql:129–136` reads completed usage without locking or reservation; many distinct jobs can all pass below 15. No owner-active-job constraint exists. The finalizer increments usage without checking the remaining allowance. `create-pack-panel.tsx:245–252` omits `requestId`, so retried requests get new UUIDs and can charge separately. The payload hash omits source type/label and future generation configuration. A completed-job row lock does prevent the same completed job from charging twice, but it does not solve repeated logical requests, concurrent jobs, or coordination with legacy reservations.

Required: one quota reservation authority across legacy/new paths; atomic allowance/concurrency enforcement; stable payload-bound request IDs through retry/reload; transactional finalization and replay tests, including month rollover.

### I2. PDF uses only a 300-character preview and sources lose provenance

`create-pack-panel.tsx:227–230` submits `pdfDoc.textPreview`; `src/app/api/pdf/upload/route.ts:106` returns that preview as the first 300 characters plus ellipsis. The durable request sends neither PDF document ID nor scan document ID, and the server accepts browser text as source without resolving the owned document. `pdf-parser.ts:77–92` still silently truncates to 20,000 characters. Page/chunk evidence and saved-document linkage are absent from the new finalization path.

Required: resolve owned PDF/scan IDs server-side; use full reviewed source or explicit section selection; no silent truncation; preserve page references and link source records transactionally. Test facts located beyond the first 300 characters and final PDF pages.

### I3. Artifact architecture still depends on one quiz per pack

`supabase/schemas/core.sql:54` retains unique `(pack_id,position)` and `:219` retains draft uniqueness by user/pack. Completion counts pack-wide questions and does not populate the added artifact provenance (`private.complete_study_attempt`, approximately `:659–690`). Study routes/history remain pack-based, and every generation finalizer creates a new parent pack instead of adding an output to an owned existing pack. The new artifact table/backfill is a useful start but does not deliver independent multiple-artifact semantics. Existing one-quiz fixtures still work; this is not proof of all legacy migration compatibility.

Required: complete the approved artifact-keyed question, draft, attempt and library contracts with an additive legacy adapter/backfill; retain old pack entry points while resolving a specific artifact.

### I4. Requested quiz subtypes and identification are absent

The plan explicitly requires `multiple_choice`, `fill_blank`, `identification`, with `mixed` as request configuration. `gemini-study-pack.ts:11,59,198,413` accepts only the old two kinds; artifact migration `:195` does too. The chooser only selects artifact kind and count, never a quiz subtype.

Required: deliver the specified subtype contract through chooser, request, generator, persistence and grading; preserve old questions and MC-only Live eligibility. Do not add other kinds.

### I5. Flashcard session persistence is not reliable or transactional

`flashcard-study-view.tsx:67–91` generates a fresh session on mount, initializes counters/queue from zero instead of persisted state, and silently switches to an offline UUID on API failure. `:174` Study Again makes a local UUID without starting a server session; `:223` ignores save failures/non-2xx results. `privileged-supabase.ts:667–700` inserts an attempt then separately updates counters. `api/flashcards/attempt/route.ts:33–89` does not check matching session/card artifact, pinned version, expected queue head/ordinal or active state.

Required: authoritative atomic attempt/session transition with lock and replay-safe ordinal; resume saved identity/queue/stats; create real restart sessions; expose persistence errors rather than showing false mastery.

### I6. Flashcard mutations can forge progress or attach foreign parent IDs

`20260926040000_flashcards_mastery.sql:37–106` grants authenticated direct CRUD with predicates checking only the row's `owner_id`. Foreign keys do not establish matching parent ownership/artifact/session/card. `study_artifacts` itself also grants client mutations with owner-only predicates (`20260926020000_study_artifacts_model.sql:37–54`), without checking that the parent pack has the same owner. Users can set their own mastery/correctness/counters directly and attach owned rows to known foreign parent IDs.

Required: enforce parent ownership consistency and revoke unrestricted writes to authoritative session/attempt fields; use checked mutation paths. Execute two-account negative tests against real RLS, not source-text checks.

### I7. Saved deck editing/deletion, incomplete exit and flashcard Progress are missing

`api/flashcards/deck/route.ts:25` offers creation only; cards endpoint is GET only. The manual creation modal edits unsaved entries, not a saved deck. No saved card edit/delete/version workflow or session-end API was found. Three misses merely announce feedback (`flashcard-study-view.tsx:208`) while retry continues; no Continue/End incomplete choice. Progress still consumes only quiz attempts.

Required: deliver the already planned saved CRUD/version behavior, bounded retry exit, and persisted flashcard mastery/first-try progress integration. Verify flow E after reload and edits during an active session.

### I8. Scan reorder fails; validation/upload/cleanup are incomplete

Remote constraint restricts positions to 0–4; migration `20260926050000_paper_scan_intake.sql:414` temporarily adds 100, which immediately violates that constraint. Upload (`scan/upload/route.ts:58,107`) trusts MIME, lacks decoded image/pixel/orientation and total 20 MiB checks, uses server multipart rather than approved direct owner upload, and requests upsert despite no Storage UPDATE policy. The remote bucket is private and user-prefix SELECT/INSERT/DELETE policies exist. Account deletion cleans only `study-sources` (`privileged-supabase.ts:258–277`), leaving scan objects; no abandoned-object cleanup was found.

Required: valid transactional reorder; actual image and aggregate limits; approved upload path; replacement policy or non-upsert semantics; explicit scan/object cleanup and account-deletion integration. Run SQL and real phone tests.

### I9. Tutor context budget is bypassable

`tutor-retrieval.ts:153` accepts the first chunk regardless of maximum total characters. A reviewer executed the actual function with one 75,000-character page and `maxTotalChars:3500`; formatted context was 75,031 characters. Six exchanges are count-bounded but no combined history/source prompt-token cap exists.

Required: subdivide oversized pages/paragraphs and enforce a hard combined prompt budget, including the first chunk; test long source and maximum-size history. Keep Groq isolated.

### I10. Profile projection does not enforce friendship

`20260926060000_friend_profiles_and_live.sql:77–118` computes friendship but returns data when it is false; `api/users/[username]/route.ts:31` delegates to it. Academic fields are opt-in and private student content is not returned, but the intended friend-only identity projection can be enumerated by strangers.

Required: enforce the plan's self/friend authorization boundary on the server and test unrelated authenticated accounts. Keep base profiles SELECT self-only.

### I11. Live RPC overloads make ordinary room creation ambiguous

Remote catalog contains `create_live_room(uuid)` and `create_live_room(uuid,uuid DEFAULT NULL)`. Phase 7 never removes the old overload. UI `live/page.tsx:128` supplies only pack ID; API sends only `p_pack_id` when artifact ID is absent. The old function includes fill-blank snapshots with default correct index zero; the new MC-only filter does not safely replace it.

Required: one unambiguous API contract, explicit eligible artifact resolution, safely retire the old overload, and test pack-only legacy adapter plus MC-only multiplayer flow J. Server scoring itself remains authoritative.

### I12. Timer completion identity is recreated on reload/tabs

`timer-provider.tsx:59,206` tracks announcement in an instance ref and makes completion token from current time. Restoring the same completed timer can sound/notify again; multiple tabs each announce. Start playback occurs inside a state updater (`:223–236`). Completion invokes only `complete-alarm`; the provided `complete-bark` capability is not wired into timer completion.

Required: persisted stable session/event identity and cross-tab deduplication; side effects outside state updater; test reload at completion and simultaneous tabs. Missing MP3 fallback must remain clearly labeled; final bark quality is not accepted without supplied assets.

### I13. Declarative schema and remote release claims are not synchronized/proven

`core.sql:2405` retains the old Live definition; `:3419–3566` retains only the three-argument finalizer rather than the four-argument flashcard implementation. The remote ledger confirms all **seven** V5 implementation migrations, including Phase 1 `20260926010000`; the checkpoint lists only six. Applied SQL does not prove valid runtime behavior, as the finalizer and scan reorder show. No Phase 0 contract report, complete rollback rehearsal evidence, deployed application commit identity, or authenticated A–J evidence was found.

Required: synchronize declarative schema/migrations, remove accidental overloads with forward migrations, verify clean-database replay and legacy-data upgrade/rollback, then record deployed commit/config/migration bindings and real staging acceptance evidence. Correct checkpoint statuses until gates pass.

### I14. Verification gates are incomplete despite green unit tests

There are no V5 50-question/Scan/flashcard A–J authenticated E2E tests. Phase 3 tests exercise planners/fixtures, never the real worker/finalizer or quota races. Phase 4 tests exercise pure helpers, never persistence/RLS/resume/CRUD. Scan reorder tests mock RPC success. Sound tests run without `window`, returning before playback/deduplication. Meaningful Markdown XSS and grading/queue tests do exist. Lint is failing. Existing browser tests have stale selectors/tab ordering as well as failures and cannot establish V5 acceptance.

Required: behavioral integration tests for the concrete defects above, real migrated-SQL/RLS tests, mocked-provider A–J E2E, targeted live staging smoke and accessible modal/mobile checks; repair stale expectations to assert current intended behavior, not remove assertions or skip failures.

### I15. Unguarded maintenance function is remotely callable by anon

Remote advisor and `has_function_privilege('anon','public.cleanup_expired_records()','EXECUTE')` confirm anonymous EXECUTE. The SECURITY DEFINER body has no caller guard and deletes expired drafts/requests and finishes rooms across users. This predates V5, but is in scope for final database security verification. Local migration `20260925300000...:61` revokes PUBLIC only; remote anon authorization remains.

Required: restrict maintenance to the intended trusted scheduler/server role, review actual grants/default grants, and verify unauthenticated denial without executing global cleanup during tests on production.

## MINOR findings

1. Manual deck modal uses plain divs without dialog semantics/focus trapping/Escape/focus restoration (`create-manual-deck-modal.tsx:95`); close icon lacks a name and fields lack associated labels. Flashcard recall label is unassociated (`flashcard-study-view.tsx:320`). Use the existing accessible dialog/field primitives; add targeted keyboard/axe tests. These accessibility fixes are required before the relevant phase gate can pass.
2. New availability descriptions remain in an unimported matrix; no consumer of `EDITORIAL_FEATURES` was found. Existing runtime “Available” copy is not contingent on failed generation wiring/provider state. Wire accurate capability states where already promised.
3. DM preference currently gates acquiring a conversation, not sending within an existing conversation. `send_direct_message` remains membership-only. The plan explicitly requires the conversation gate; if Settings promises complete message opt-out, enforce it during send. Otherwise accurately label the current preference. Do not silently broaden product semantics.

## OPTIONAL

No optional redesign or feature proposals. Correction work below is limited to existing V5 requirements and verified release defects.

## Phase coverage

| Phase | Result | Evidence |
|---|---|---|
| 0 | Not established | No complete baseline/remote discrepancy/rollback report; later runtime mismatches missed. |
| 1 | Partial | Friend ID mapping and PDF extracted status corrected; Live overload regression remains. |
| 2 | Partial | Artifact table/backfill exists; multi-artifact quiz/draft/history and identification missing. |
| 3 | Failed | B1–B4, quota and PDF issues. |
| 4 | Failed | Fixtures, missing saved CRUD, broken resume/transaction/RLS/progress. |
| 5 | Partial/failed acceptance | Private bucket and OCR/review exist; reorder, validation/linkage/cleanup fail. |
| 6 | Partial | Safe renderer and Groq separation work; context budget/provenance incomplete. |
| 7 | Partial | Friend IDs/direct reuse and server scoring exist; profile boundary/Live overload fail. |
| 8 | Partial | Curated embeds and absolute timer exist; dedupe/audio asset gates incomplete. |
| 9 | Failed | Lint/browser failures, no complete A–J/rollback/deployment evidence, schema drift. |

## Requested verification matrix

“Verified boundary” means supported by inspected code/catalog/tests, not blanket release certification.

| # | Requested verification | Result |
|---|---|---|
| 1–2 | All phases / no skipped requirements | NO: see phase table and findings. |
| 3 | Artifact architecture / backward compatibility | PARTIAL: table/backfill present; pack-wide semantics remain; legacy upgrade not proved. |
| 4 | Durable, batched, grounded, idempotent 50 | NO: B1–B4/I1/I2. Batch planning and full-span quote check helpers exist. |
| 5 | Cannot double-charge | NOT PROVED: same completed job locks, logical retries and concurrency not protected. |
| 6 | Full flashcard lifecycle | NO: I5–I7. Pure typed grading/delayed queue helpers work. |
| 7 | Scan private/security | PARTIAL: bucket private; validation/cleanup/linkage/reorder defective. |
| 8 | Gemini 3.7 integration | Provider adapter/model ID and structured question path exist; decks/summaries do not use it. No live provider smoke certification. |
| 9 | Groq Tutor isolation | VERIFIED in code: Tutor uses Groq only, default `openai/gpt-oss-120b`; no Gemini quota mixing. |
| 10 | Tutor sanitized Markdown | VERIFIED tested renderer boundary: no raw HTML execution, HTTP(S)-only links with safe target attributes, shared saved/stream path. |
| 11 | Friend student privacy | PARTIAL: no private source/email/answers/messages projection; friendship boundary missing. |
| 12 | Direct conversations | UUID mapping and canonical reuse present; real two-account acceptance not proved. |
| 13 | Live authoritative scoring | VERIFIED code boundary, but creation/eligibility broken by overload. |
| 14 | Private answer keys inaccessible | VERIFIED direct-table boundary: private table, no anon/authenticated grants, no Realtime publication; grading reveals only submitted answer feedback. |
| 15 | All RLS correct | NO: flashcard parent/write authority gaps; RLS enabled alone is insufficient. |
| 16 | Storage private | VERIFIED bucket/private owner prefixes; replacement/cleanup gaps remain. |
| 17 | Realtime authorization | Membership/room RLS and publication inspected; no authenticated reconnect/negative delivery proof. NOT fully certified. |
| 18 | Pomodoro truthfulness | PARTIAL: absolute time, optional permissions, chimes; reload/cross-tab dedupe and bark acceptance incomplete. |
| 19 | No copyrighted download/proxy | VERIFIED inspected code: YouTube embeds/watch links only; no downloader/proxy. |
| 20 | Secrets committed | None detected by history patterns; `.env.local` untracked. Not an exhaustive assurance for arbitrary formats. |
| 21 | Existing users/packs | Single-quiz fixtures preserved; handle/backfill and full real legacy-data upgrade gates remain. |
| 22 | Safe ordered migrations | Versions applied, but runtime-invalid SQL, retained overloads and reference-schema drift invalidate approval. |
| 23 | Accessibility | PARTIAL: existing axe smoke passes; new modal issues and stale keyboard test failure. |
| 24 | Mobile/responsive | Desktop four-width smoke passes; mobile four-width test fails with hidden Messages heading; real phone Scan/new study flow acceptance remains unproved. |
| 25 | Meaningful tests | Mixed: useful pure/XSS tests; major integration/state/security paths absent or mocked away. |
| 26 | Production equals repo/migrations | Database ledger/catalog verified; application deployment identity NOT VERIFIED. |

## Checkpoint claim reconciliation

The unit count, typecheck and build claims were reproduced. Separate phase commits were confirmed. All seven V5 migration versions exist in the remote ledger; the checkpoint's six-entry list omits Phase 1. “Core reference schema completely synchronized,” “all exit gates satisfied,” “no unresolved blockers,” and flows A–J PASS are contradicted by the findings. Treat the checkpoint as a worker report, not verified release evidence. It should explicitly record failed and pending gates until independently rerun.

## Required next step

Use `docs/ANTIGRAVITY-CORRECTION-HANDOFF-V5.md`. Do not release on the strength of the current checkpoint. Re-review after focused corrections and evidence are available; do not use `FETCH V5 FINAL ARCHITECTURE REVIEW: PASSED` until every blocking/important defect is closed and required deployment verification is complete.

## Reference checks

The model identifier is supported by Google's current documentation: [Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash). Default/custom schema targeting was checked against [Supabase custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas). These documentation checks do not replace the reproduced repository/remote defects above.
