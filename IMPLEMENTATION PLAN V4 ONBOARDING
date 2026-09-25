# FETCH first-time student onboarding

## Antigravity + Gemini 3.8 Flash High implementation handoff

**Status:** Product and architecture plan awaiting owner approval. This document is an implementation specification, not a record of implemented work.

**Repository:** `C:\Users\LEGION\Documents\FETCH 2.0`  
**Baseline inspected:** 26 September 2026  
**Worker:** Antigravity + Gemini 3.8 Flash High  
**Objective:** Give a newly authenticated student a short, skippable, durable first-visit setup that improves the next real study action across FETCH.

## 1. Instructions to the implementation worker

1. Read this whole document before editing. Check the current repository state and adapt line-level details if the code has changed since the baseline date. Preserve the decisions and acceptance criteria here.
2. Follow `AGENTS.md`. This project uses Next.js 16.3.5; read the relevant installed guides in `node_modules/next/dist/docs/` before changing routes, layouts, route handlers, redirects, or proxy behavior. In particular, read the App Router authentication, layout, route-handler, and redirect guides. Do not implement from older Next.js conventions.
3. Treat `PRODUCT.md`, `DESIGN.md`, and `src/app/globals.css` as the product and visual-system authorities. Preserve the current legal/public-registration gate and truthful demo labeling.
4. Implement the phases in order. Finish each phase's exit gate before proceeding. Use the repository's existing Supabase schema/migration workflow; inspect current CLI help and the local configuration rather than guessing commands.
5. Do not invent additional onboarding questions, AI behavior, calendar recurrence, analytics, paywalls, or social defaults. The field contract and downstream behavior below are complete for this release.
6. Report changed files, migration and rollout instructions, test results, and remaining limitations in the final implementation report.

## 2. Product decision

After the first successful account authentication, show a focused, two-step onboarding flow. Ask only for an optional subject or course, an optional study goal, and a preferred focus-block duration. The user may skip. Persist the outcome so the flow does not reappear at every login. Finish by inviting an actual study action: add material, plan one event, or start a timer.

Onboarding is a first-visit guide, not an authorization boundary. A direct deep link to another study tool may remain accessible, while a pending account's Home visit enters onboarding. Existing accounts must continue to Home without being forced through a new flow. Demo visitors remain in browser-local demo mode.

### Explicit exclusions for this release

- No school, institution, grade level, age, location, learning diagnosis, or other demographic questions.
- No generated StudyPack without source material.
- No calendar event, repeating schedule, push permission, or reminder created merely by completing onboarding.
- No fabricated streak, study-session count, weekly target, or goal achievement.
- No hidden AI prompt based on preferences; an AI Tutor starter question is visible and editable.
- No changes to public account-registration availability, pricing, or legal copy beyond removing study-preference questions from signup when the new flow is ready.

## 3. Verified baseline and constraints

| Area | Current implementation | Design consequence |
| --- | --- | --- |
| Auth entry | `src/components/auth/login-card.tsx` signs in with password and routes to `/app/home`; Google OAuth requests `/auth/callback?next=/app/home`. `src/components/auth/signup-wizard.tsx` sends confirmed signup to the same destination. | Keep the underlying auth mechanisms and confirmation flow. Resolve the first-visit destination after authentication. |
| Public registration | `signup-wizard.tsx` routes to demo except for `?test_signup=1`; even configured auth presents a legal/public-registration gate. | Preserve that product gate; onboarding applies to actual signed-in accounts, including test accounts and future enabled registration. |
| Callback and recovery | `src/app/auth/callback/route.ts` validates `next` with `safeNext()`, repairs a missing profile using `ensure_profile`, emits `auth=setup-username` or `auth=username-taken`, and diverts recovery to `/app/reset-password`. `tests/unit/auth-callback.test.ts` covers these behaviors. | Preserve allowlist/open-redirect defense, username-repair signaling, and recovery precedence. Add `/app/start` to allowed destinations only if required. |
| Account identity | `public.profiles` has `id`, `display_name`, `username`, `avatar_url`, and timestamps. Auth trigger and `ensure_profile` provision/repair it. `GET/PATCH /api/account/profile` and Settings edit it. | Keep identity in `profiles`. A nullable username must not block learning; provide a visible Settings link to repair it. |
| Existing study prompts | Signup's optional subject and goal are sent in `user_metadata`, but neither `profiles` nor the workspace consumes them. | Move prompts to post-auth onboarding. Do not use editable auth metadata for authorization or as the long-term preference record. |
| Workspace mode | `src/app/app/(workspace)/layout.tsx` uses `getAuthenticatedRequestContext()` to select `account` or `demo`, then mounts `DemoProvider`, `TimerProvider`, `MusicProvider`, and `AppShell`. | Onboarding is account-only and outside this workspace shell. Do not confuse a failed account-storage read with a demo user. |
| Account workspace | `GET /api/workspace` loads ready packs, up to 50 attempts, and up to 100 events; `DemoProvider` loads them. | Keep the existing data model. Do not compute an all-time or weekly target from these limited response windows. |
| Settings | `/api/account/profile` handles identity. `/api/account/preferences` calls private preference RPCs for discoverability, direct messages, and reminders. Demo name is browser-local. | Add a distinct Study preferences section and account endpoint. Keep social/privacy controls separate. |
| StudyPacks | The Home `CreatePackPanel` requires actual pasted text or a PDF in account mode; links are marked coming soon. | An onboarding subject is context only. It is not study material. |
| Calendar | `calendar_events` and `/api/calendar-events` store individual study/exam/deadline events. No recurrence model exists. | Offer a link to Calendar and optional prefill only after the user explicitly opens a new-event editor. |
| Pomodoro | `focus-timer.ts` defaults to 25 minutes and `timer-provider.tsx` persists to the shared browser key `fetch-focus-v1`. | Apply a preferred duration only to an idle, unsaved timer. Separate persisted account timer state by account ID and preserve demo state. |
| Account switching and drafts | `DemoProvider` is keyed only by mode, so two account users can retain in-memory state across a same-mode switch. `StudySession` saves drafts under the actual account user ID, but Home, Progress, and AppShell search under the literal `account` scope. | Key account-backed provider state by user ID and make all account draft discovery use that same user ID. Test switching accounts and resuming a real account draft. |
| Progress | Progress derives activity from attempts and `getStudyRecommendation()` prioritizes draft, low score, recent pack, new pack, then pack creation. | Keep measured metrics based on real attempts and preserve the recommendation order. |
| AI Tutor | `/api/tutor` uses `GroqTutorProvider` and `GROQ_API_KEY`; workspace `tutorAvailable` and some Tutor copy currently check or mention OpenAI instead. | Correct availability signaling and copy as part of onboarding integration. Do not present the Tutor as usable without the provider it actually calls. |
| Design | `DESIGN.md` and `globals.css` define blue/white semantic tokens, Fredoka headings, Nunito body text, 12–16px radii, visible focus, dark mode, reduced motion, and supplied pixel mascot assets. | Reuse this system; avoid a visually separate onboarding brand. |

The earlier `docs/FETCH-REFINEMENT-IMPLEMENTATION-PLAN.md` specifically recommends moving subject and goal from signup to skippable post-signup onboarding. The backend plan also says to add profile-adjacent study fields only when a real Settings/onboarding control both persists and reads them.

## 4. User journey and routing contract

### 4.1 Entry resolver

Add `/app/start` as a server-rendered destination resolver outside the `(workspace)` route group. It must not render the workspace shell.

| Condition | Result |
| --- | --- |
| No authenticated account | Redirect to `/app/home`, which retains explicit browser-demo labeling. |
| Authenticated account; no `student_preferences` row | Treat as `pending`; redirect to `/app/onboarding`. |
| Authenticated account; status `pending` | Redirect to `/app/onboarding`. |
| Authenticated account; status `completed` or `skipped` | Redirect to `/app/home`. |
| Preference RPC/storage error | Render a retryable account-state error. Never infer `skipped` and never switch to demo. |

Use the existing `getAuthenticatedRequestContext()` mechanism. Preference reads must be per-request and uncached. Avoid a client-side flash of Home before redirect. Keep a separate server check on `/app/home` so old bookmarks and existing auth destinations also route a pending signed-in account to onboarding. Do not put an account-completion query into the global proxy; the proxy currently refreshes sessions, while the app server route can provide a clearer data/error state.

### 4.2 Auth destination changes

1. Password sign-in success: replace `/app/home` with `/app/start`, then refresh the router as the current sign-in path does. The explicit **Enter development demo** button still goes directly to `/app/home`.
2. Google OAuth and signup email confirmation: use `/auth/callback?next=/app/start` for their default Home intent.
3. Immediate-session test signup: route to `/app/start` after profile creation.
4. Callback recovery: continue to `/app/reset-password` regardless of a pending onboarding state.
5. Valid non-Home `next` destinations retain current semantics. If a callback requests a specific safe deep link, preserve it; the Home server check still catches a first Home visit.
6. Add `/app/start` to the `safeNext()` allowlist, but **keep `safeNext(null)` and invalid-target fallback at `/app/home`** so the current security contract remains stable. The explicit default auth flows above pass `next=/app/start`; the Home server check handles legacy callbacks. Preserve the existing open-redirect tests and add explicit `/app/start` coverage.
7. Preserve `auth=setup-username` and `auth=username-taken` signals. `/app/start` accepts only these two known `auth` values and forwards them to `/app/onboarding` for pending accounts or `/app/home` for terminal accounts. On onboarding, display an unobtrusive notice and link to `/app/settings?auth=setup-username`; Settings remains the place to claim/repair a username. Keep the distinction between a missing username and a collision in the displayed copy. Discard all other query values. After Finish, carry the known username notice to Home or preserve the visible Settings link on the completion screen until the student leaves it.
8. `src/components/auth/reset-password-form.tsx` currently returns to `/app/home` after a successful reset. Leave recovery itself outside onboarding; the Home server check will send a still-pending account into onboarding only **after** the password update succeeds.

### 4.3 Onboarding route

`/app/onboarding` requires a real authenticated account. An unauthenticated visit goes to `/app` sign-in or the existing demo entry, not an account-looking form. A completed/skipped account visiting the route should go to Home; Settings provides editing thereafter. A preference-storage failure shows retry. Fetch the current profile display name for a greeting, but handle missing profile through the existing repair path rather than creating a second identity system.

On a successful Finish mutation, keep the client on a local completion state until the student chooses an action; do not immediately refresh `/app/onboarding`, because its server entry must redirect terminal accounts to Home. The chosen link then performs a fresh navigation and receives current preferences. On successful Skip, navigate directly to `/app/home`. If mutation fails, remain on the same screen with preserved answers. Disable submission while a request is in flight and check the returned status, so a cross-tab terminal-state race cannot display a false completion.

## 5. Onboarding screen specification

### 5.1 Step 1: Study focus

- Heading: **What are you studying?**
- Optional text field: **Subject or course**. Placeholder such as “Biology, history, programming…”; trim leading/trailing whitespace, maximum 100 characters. Blank is valid.
- Optional single-choice goal, with no preselected answer:
  - **Prepare for an exam** → `exam`
  - **Understand difficult material** → `understand`
  - **Build a study habit** → `habit`
- One short explanation: “We’ll use this to suggest a useful first step. You can change it in Settings.”
- Actions: **Continue** and **Skip for now**. Continue works with both optional fields blank.

### 5.2 Step 2: Focus block

- Heading: **How long would you like to focus?**
- Single-choice durations: **15 minutes**, **25 minutes**, **45 minutes**. Preselect 25 minutes. Explain that this is the starting Pomodoro length, editable later.
- Actions: **Back**, **Finish setup**, **Skip for now**.
- Back retains step 1 values. No per-step server write is necessary; submit the complete selected set at Finish or Skip.

### 5.3 Finish state and first action

After the server confirms `completed`, show or navigate through a compact completion state whose primary action is **Add study material** → `/app/home#add-material`. Secondary links: **Plan a study session** → `/app/calendar`; **Start a focus timer** → `/app/pomodoro`. On Skip, navigate to Home with a generic first-study prompt. Use language that distinguishes a saved preference from a completed learning activity. Do not imply the user has studied merely by completing setup.

### 5.4 Interaction and accessibility

Use the existing FETCH identity: semantic blue/white tokens, Fredoka for the heading, Nunito for reading/controls, and one purposeful supplied mascot image. Target a form width near the current signup card rather than a multi-column dashboard. Keep content left-aligned where it improves scanning. Selected cards need text and radio semantics, not color alone. Expose “Step 1 of 2”/“Step 2 of 2” in accessible text. Maintain clear `<label>` associations, keyboard access, focus order, `aria-describedby` for hints/errors, and a live region for save failure/success. Keep controls visible on narrow screens when the software keyboard opens. Avoid automatic mobile focus. Respect dark tokens and reduced motion. Use meaningful error copy with Retry; retain local input on failures.

## 6. Data model and migration

Create `private.student_preferences`. It is private account data, distinct from `public.profiles` and the existing `private.account_preferences` social/reminder table.

| Column | Contract |
| --- | --- |
| `user_id` | UUID primary key; FK to `auth.users(id)` with `ON DELETE CASCADE` |
| `primary_subject` | nullable text, trimmed, max 100 characters; blank input stored as `NULL` |
| `study_goal` | nullable text constrained to `exam`, `understand`, `habit` |
| `focus_minutes` | integer constrained to `15`, `25`, `45`; default `25` |
| `onboarding_status` | text constrained to `pending`, `completed`, `skipped` |
| `onboarding_version` | integer, initial value `1`; reserve for a future explicitly planned flow change |
| `completed_at` | nullable `timestamptz`; set on `completed`, null on `skipped` |
| `created_at`, `updated_at` | non-null `timestamptz` |

### 6.1 Existing and new accounts

- During the migration, backfill **all auth users existing at migration time** with `onboarding_status = 'skipped'`, default focus duration, and null subject/goal. Use an idempotent insert and do not overwrite a row already created during rollout. This avoids surprising established users, including users whose profile was previously repaired.
- A newly authenticated account **without** a preference row is logically `pending`. Do not add another auth-user trigger merely to make this row; the current profile trigger already handles identity, and an extra signup-time write creates another signup failure point.
- The getter returns pending defaults without writing a row. The first Finish, Skip, or Settings Save creates the owner row.
- If a user is created during a staggered migration/app rollout, absence still resolves safely to pending. Deploy database support before the UI that calls it.
- Deletion cascades through the FK; include the values in account export.

### 6.2 Security and functions

Enable RLS on the private table as defense in depth. Do not expose `private` through the Supabase Data API. Do not grant direct table access to `anon` or `authenticated`. Add narrow `public` RPC wrappers that derive `user_id` exclusively from `auth.uid()` and reject a null/anonymous identity; a Supabase anonymous sign-in can have the `authenticated` database role, so a role grant alone is insufficient. Align the check with the existing `is_anonymous` claim check in `getAuthenticatedRequestContext()` and test an anonymous-auth session if enabled. If `SECURITY DEFINER` is needed to reach the private table, set `search_path = ''`, schema-qualify database objects, revoke default `PUBLIC` execution, and grant execution only to `authenticated` (and the required server role). Return only the caller's row. Review the final grants, including the project's Data API exposure settings and RLS policy behavior. Never authorize via `user_metadata`. Do not log subject text or raw preference payloads.

Recommended RPC interface:

- `public.get_student_preferences()` returns the normalized owner object. Missing row returns `{ primarySubject: null, studyGoal: null, focusMinutes: 25, onboardingStatus: 'pending', onboardingVersion: 1, completedAt: null }`. A read has no side effects.
- `public.save_student_preferences(p_primary_subject, p_study_goal, p_focus_minutes, p_action)` accepts a **full replacement** of the three preference values plus action `complete`, `skip`, or `save`. Validate length, enum, and duration again in SQL. Use one atomic owner-row transaction. For a pending row or no row, `complete` sets status `completed` and a completion timestamp; `skip` sets status `skipped`, clears subject and goal to null, uses 25 minutes, and leaves `completed_at` null. `save` preserves an existing status and timestamp; when it creates a previously absent row, status remains `pending`. A terminal status is monotonic: a stale tab's later `complete` or `skip` must return the already terminal record without overwriting its status, values, or timestamp. Repeated identical requests must be safe. Return the normalized stored object so the UI responds to the actual result.

The route should also validate; SQL constraints/functions are the final guard. If a later Settings save follows `skipped` or `completed`, it changes preferences but does not replay onboarding. The owner can update preferences without creating a fictitious completion event.

### 6.3 Schema workflow

The repository contains `supabase/schemas/core.sql` and timestamped migrations, while `supabase/config.toml` currently comments out `declarative_schema_path`. Inspect how this checkout actually generates and applies schema changes before running CLI commands. Keep the desired schema and migration consistent. Generate/review the migration with the supported local workflow and never deploy a destructive schema replacement. Test both a fresh database and an upgraded database with existing users.

## 7. HTTP and shared TypeScript contract

Add `src/app/api/account/study-preferences/route.ts` with `GET` and `PATCH`, backed by a shared Zod/type module in `src/lib/`.

### GET

- Require `getAuthenticatedRequestContext()`; unauthenticated response: HTTP `401`, `{ code: 'AUTH_REQUIRED', error: ... }`.
- Call `get_student_preferences()` for the authenticated owner.
- Success: HTTP `200`, `{ preferences: { primarySubject, studyGoal, focusMinutes, onboardingStatus, onboardingVersion, completedAt } }`.
- Storage/RPC failure: HTTP `503`, stable `STUDY_PREFERENCES_UNAVAILABLE` code and retryable message. Do not return default pending as a substitute for an RPC failure.
- Send user-specific response with no-store behavior.

### PATCH

- Require authentication. Parse JSON with a bounded body. Validate the complete payload: `primarySubject: string | null`, `studyGoal: 'exam' | 'understand' | 'habit' | null`, `focusMinutes: 15 | 25 | 45`, `action: 'complete' | 'skip' | 'save'`. Reject unknown/invalid values rather than silently accepting a partial shape.
- Normalize trimmed blank subject to null. For `skip`, the server/RPC ignores submitted preference values and records null/null/25.
- Success: HTTP `200`, the same `{ preferences: ... }` shape. UI navigates only after this response.
- Invalid JSON or fields: HTTP `400` with stable `INVALID_STUDY_PREFERENCES` or `INVALID_JSON`; unauthenticated: `401`; persistence failure: `503` with `STUDY_PREFERENCES_SAVE_FAILED`.
- Derive owner from the authenticated request/RPC; the payload contains no user ID and cannot mutate another account.

Create one small server helper that reads the preference status and distinguishes `pending`, `completed`, `skipped`, `unauthenticated`, and `unavailable`. `/app/start`, Home, and `/app/onboarding` should use that helper rather than independently inventing absence/error behavior. Keep its interface narrow and test it through returned states.

## 8. Integration rules by feature

### Home/dashboard

- Show the profile display name when available; fall back to the existing generic heading if absent.
- If no packs exist, use `primarySubject` to make the material-intake prompt more relevant. Example: “Add your Biology notes to make your first StudyPack.” Escape/render as plain text, not HTML.
- Keep the current priority of unfinished draft, recent/recommended pack, then intake. A preference must never displace a real draft or attempt.
- For `skipped` or blank preferences, retain generic useful copy.
- In account mode, loading or failed account data should not momentarily show a false empty-state recommendation. The existing `/api/workspace` status must remain visible.

### StudyPacks

- Optionally show `primarySubject` near the create-pack panel as context or a suggested title. Never treat the subject as source content; existing minimum source and AI validation remain intact.
- Do not modify pack ownership, quota, source storage, answer-key secrecy, or generation provider choice.

### Calendar

- Completion links to `/app/calendar`. Existing event creation remains explicit.
- If adding a new-event prefill path, prefill `subject` only when the user opens a **new** editor; never overwrite an edited event. No event is created during onboarding.
- Keep time-zone conversion and date validation in the existing Calendar/API path. Do not introduce recurring schedule claims; current `calendar_events` represents single events.

### Pomodoro

- Preferred `focusMinutes` sets the **initial idle Focus duration** when no valid saved timer exists for that account. Preserve an active, paused, or completed timer and any duration the student changed inside Pomodoro. Initialize `remaining` consistently with the chosen minutes before rendering an idle timer. A valid saved timer takes precedence on ordinary page loads.
- Scope browser timer storage by authenticated `userId` and keep a separate demo key. Prevent user A's timer from being shown to user B after sign-out/sign-in in the same browser.
- In the workspace layout, key the account-backed provider subtree by `userId` as well as mode so `DemoProvider`, timer state, and preference state reinitialize when the signed-in user changes. Do not rely on the existing `key={mode}` to isolate two accounts.
- Define a safe one-time migration of the old `fetch-focus-v1` state: it can remain demo-only; do not silently assign an unowned old timer to a signed-in account. Keep `restoreTimer()` validation and existing timer UI behavior.
- An explicit Settings Save of a different focus duration takes precedence over the old saved **default** for the next newly prepared Focus session. If a countdown is active or paused, queue the new default without changing its current `remaining`, `endAt`, or progress denominator; apply it when that session is completed/reset and the next Focus session is prepared. A direct duration change inside Pomodoro continues to control the current/local timer until another Settings Save. Define this transition in the timer provider and test it, including reload after Settings Save.

### Existing study-draft scope

- `src/components/study/study-session.tsx` already uses `userId` for account draft storage. Change the account draft lookups in Home, AppShell, and Progress to the same `userId` from `DemoProvider`; use `demo` only in demo mode.
- Keep the draft schema, age, fingerprint, server draft synchronization, and active-session priority intact. The onboarding change must not make a real account draft disappear from Home or Progress. Validate a two-account same-browser case.

### Progress

- Metrics and streaks remain derived from completed study attempts. Onboarding does not create history.
- Tailor the no-attempt explanation or next-action copy to `studyGoal` while routing to an existing useful action. Examples: exam → make a pack from exam notes; understand → make a pack and practice tricky material; habit → start with a short pack.
- Preserve `getStudyRecommendation()` priority and the existing review recommendation for real attempt data.
- Do not show weekly-target achievement. `/api/workspace` currently caps attempts at 50 and cannot support an accurate all-time or arbitrary weekly target by itself.

### AI Tutor

- The Tutor can show one **visible, editable** starter question based on goal and optional subject, only if configured and available. Sending still requires an explicit user action. An example is “Can you help me understand the hardest idea in Biology?”
- Never add preference text as an invisible system instruction. Continue current source-grounded behavior when a StudyPack is selected and preserve server ownership checks and quota enforcement.
- Align `tutorAvailable` in the workspace layout and Tutor availability copy with the provider `/api/tutor` actually uses (`GROQ_API_KEY`/`GroqTutorProvider`). When unavailable, show the existing honest unavailable state; onboarding must not promise Tutor access.

### Settings, export, and deletion

- Add a distinct **Study preferences** card to account Settings with subject, goal, focus duration, descriptive help, save state, and errors. Fetch from the new GET route and save through PATCH action `save`.
- Keep Account Profile, public username, social/privacy preferences, appearance, export, and deletion controls in their existing sections. Demo Settings must not call the account preference endpoint.
- After save, update any shared client preference state or refresh affected routes so Home and related UI display the new values without a stale full-session cache.
- If the client uses a shared preference provider, represent `loading`, `ready`, and `error` explicitly; initialize account state from the authenticated owner only and clear it on user change. A failed fetch shows an account retry state for preference-dependent controls. Generic copy is acceptable on unrelated surfaces, but it must not look like a saved preference value.
- Extend `/api/account/export` to include the normalized student preferences and onboarding status. Ensure account deletion removes the private row through FK cascade; update deletion verification if the existing test suite checks dependent tables.

## 9. Implementation phases and exit gates

### Phase 1 — Database and contract

1. Add the private table and SQL constraints.
2. Add the legacy-user backfill, owner-only getter/saver RPCs, grants, and RLS defense.
3. Keep `supabase/schemas/core.sql` and the generated migration synchronized according to the actual repo workflow.
4. Test fresh-user absence, legacy backfill, save/skip/complete idempotency, cross-user denial, no anonymous access, and account deletion cascade.

**Exit gate:** The normalized contract works for a fresh DB and an upgraded DB, with no authorization leakage or signup-trigger regression.

### Phase 2 — Account route and resolver

1. Add shared types/Zod normalization and the `GET/PATCH /api/account/study-preferences` route.
2. Add the server preference-state resolver and its typed unavailable state.
3. Add focused route/helper tests for missing row, invalid body, unauthenticated call, RPC failure, and each status transition.

**Exit gate:** UI routes can distinguish a real pending account from a storage outage and a demo visitor.

### Phase 3 — Routing and authentication

1. Add `/app/start`, `/app/onboarding` server entry, and the server Home check.
2. Update password sign-in, OAuth callback target, and test signup success destination.
3. Preserve safe `next` handling, username-repair notice, explicit deep links, and recovery destination.
4. Update `tests/unit/auth-callback.test.ts` for every changed redirect outcome and its open-redirect cases.

**Exit gate:** A first signed-in Home visit opens onboarding once; skipped/completed accounts and demo users reach the correct experience; recovery never enters onboarding.

### Phase 4 — Onboarding UI

1. Implement the two screens, Skip, Finish, success/first-action state, errors, loading, and retained local answers.
2. Use existing brand/UI primitives and accessibility patterns.
3. Remove optional subject/goal prompts and metadata writes from signup only when the new flow is connected.
4. Verify keyboard, screen reader, mobile keyboard viewport, dark theme, reduced motion, retry, and double-click behavior.

**Exit gate:** A student can complete with all optional fields blank, skip durably, recover a failed save, and act on one real feature.

### Phase 5 — Product integration

1. Add Settings editing and export.
2. Apply Home/StudyPack/Calendar/Progress/Tutor personalization rules.
3. Scope timer storage and provider state by account ID, align Home/AppShell/Progress draft lookup with the account ID, and apply focus preference only to a new idle timer.
4. Correct Tutor provider availability and copy.

**Exit gate:** Each collected value has a visible, truthful effect; all blank/skipped states still work; existing study work remains higher priority.

### Phase 6 — Verification and rollout

1. Run `npm run typecheck`, `npm run lint`, focused unit tests, and meaningful Playwright journeys. Run the broader suite where it is a release gate; distinguish pre-existing stale assertions from new failures.
2. Test real Supabase RLS/RPC behavior locally, including two users and unauthenticated requests. Run database advisors if available and inspect final grants.
3. Test email signup with confirmation, immediate test signup, Google OAuth, password sign-in, username collision/repair, password recovery, existing account, fresh account, skip, Settings edit, account switching, demo, unavailable database, and account deletion/export.
4. Test narrow mobile layouts, keyboard-only operation, dark mode, reduced motion, and loading/error announcements.
5. Deploy database migration before app routes/UI. Check legacy backfill count, smoke test one fresh account and one existing account, then monitor preference-route failures and unexpected onboarding redirects. Keep rollback of the UI possible without dropping stored rows.

**Exit gate:** No existing student is unexpectedly forced into onboarding; a fresh student sees it once; no user data crosses accounts; every advertised feature is actually available.

## 10. File map for Antigravity

Paths are relative to the repository root. New files are marked **NEW**; the worker may choose clear equivalent filenames while preserving route URLs and interfaces.

| File | Work |
| --- | --- |
| `AGENTS.md` | Read instructions. Do not remove the Next-generated block. |
| `PRODUCT.md`, `DESIGN.md`, `src/app/globals.css` | Read product and visual rules; adjust shared styles only if needed. |
| `node_modules/next/dist/docs/01-app/02-guides/authentication.md` and relevant layout/route/redirect docs | Read installed-version guidance before coding. |
| `supabase/schemas/core.sql` | Add desired private table, constraints, RPCs, RLS/grants, and backfill-equivalent desired state as appropriate to schema workflow. |
| `supabase/migrations/<generated_onboarding_migration>.sql` **NEW** | Reviewed migration for table, functions, grants, and existing-user backfill. Determine exact filename through repo/CLI workflow. |
| `src/lib/student-preferences.ts` **NEW** | Shared normalized TypeScript contract and Zod schema. |
| `src/lib/server/student-preferences.ts` **NEW** | Server owner preference-state resolver; explicit unavailable outcome. |
| `src/app/api/account/study-preferences/route.ts` **NEW** | Authenticated GET/PATCH HTTP interface. |
| `src/app/app/start/page.tsx` **NEW** | Default post-auth destination resolver. |
| `src/app/app/onboarding/page.tsx` **NEW** | Account-only server onboarding entry. |
| `src/components/onboarding/student-onboarding.tsx` **NEW** | Accessible two-step client flow. |
| `src/components/auth/login-card.tsx` | Password/Google default destination. |
| `src/components/auth/signup-wizard.tsx` | Remove optional study prompts/metadata; route real successful signup through resolver, preserve public gate. |
| `src/app/auth/callback/route.ts` | Default destination and username signal handling; preserve recovery and safeNext security. |
| `src/app/app/(workspace)/home/page.tsx` | Add server Home pending-account check; move current client view to a sibling client file if needed. Use the real user ID for account draft lookup. |
| `src/components/app/demo-provider.tsx` or a dedicated `src/components/app/student-preferences-provider.tsx` **NEW** | Provide account preferences to client surfaces without conflating demo and account storage. Prefer a dedicated narrow provider if multiple surfaces need shared state. |
| `src/app/app/(workspace)/layout.tsx` | Wire any shared preference provider, key account-backed state by user ID, and fix Tutor availability flag. |
| `src/app/app/(workspace)/settings/page.tsx` | Study preferences editor. |
| `src/components/study/create-pack-panel.tsx` | Optional subject context only; keep source validation. |
| `src/app/app/(workspace)/calendar/page.tsx` | Explicit new-event subject prefill only if implemented. |
| `src/app/app/(workspace)/progress/page.tsx`, `src/lib/study-recommendation.ts` | Goal-aware empty-state wording without changing real-work priority; use real user ID for account draft lookup. |
| `src/components/app/app-shell.tsx`, `src/lib/study-session-draft.ts` | Use real user ID for account draft discovery and recommendation scope; preserve storage format. |
| `src/app/app/(workspace)/tutor/page.tsx` | Visible editable starter prompt and accurate availability copy. |
| `src/components/tools/timer-provider.tsx`, `src/lib/focus-timer.ts`, `src/app/app/(workspace)/pomodoro/page.tsx` | Account-scoped persistence and idle preference application. |
| `src/app/api/account/export/route.ts`, account deletion tests | Export/cascade verification. |
| `tests/unit/auth-callback.test.ts`, `tests/unit/account-profile.test.ts`, new focused preference tests | Redirect and account-contract regression tests. |
| `tests/e2e/account-journey.spec.ts`, onboarding E2E test file | End-to-end first visit, return, skip, error, and demo cases; fix selectors affected by current copy. |

Existing adjacent routes to inspect without changing unless integration requires it: `/api/workspace`, `/api/calendar-events`, `/api/tutor`, `/api/generate`, `/api/pdf/generate`, `/api/account/profile`, `/api/account/preferences`, and `/api/account/delete`. Existing database objects to preserve: `public.profiles`, `private.account_preferences`, `public.study_packs`, `public.study_sessions`, and `public.calendar_events`.

## 11. Acceptance matrix

| Scenario | Required result |
| --- | --- |
| New confirmed email account | Profile exists/repairs; first default Home intent opens onboarding; Finish saves once; next login goes Home. |
| New Google account with username | Same first-visit flow; existing profile identity preserved. |
| Google/confirmation username collision | Notice explains missing username and links to Settings; student can still finish or skip onboarding; username save remains uniquely validated. |
| Existing account at migration | Backfilled `skipped`; lands on Home; may edit study preferences in Settings. |
| New account chooses Skip | Durable `skipped`; generic Home; no recurring prompt. |
| Two tabs submit Finish and Skip concurrently | Exactly one terminal state wins; later response returns stored terminal state; UI never reports the losing action as successful. |
| Blank optional answers | Finish succeeds with null subject and goal, 25-minute preference, completed status. |
| Preference save or read outage | Clear retryable error; no false success, demo fallback, or partial navigation. |
| Password recovery | Reaches reset-password regardless of onboarding state. |
| Direct `/app/home` by pending account | Server routes to onboarding before Home client content is shown. |
| Direct tool link by pending account | Existing tool authorization and behavior remain intact; Home later invites onboarding. |
| Demo visitor | Browser-local study experience remains visibly demo; account preference endpoint returns 401. |
| User switches accounts in one browser | No shared focus timer or preference data appears for the other account. |
| Account draft after onboarding | Home, AppShell, and Progress find the draft saved under that user ID and offer the correct Resume action. |
| Active timer, then Settings edit | Active timer continues unchanged; new idle Focus session uses the updated preference. |
| No packs/attempts | Helpful goal/subject copy; no fake progress or generated content. |
| Tutor unavailable | Honest unavailable messaging; no clickable send that claims a working AI provider. |
| Account export/deletion | Export includes preferences; deletion removes them. |
| Accessibility | Keyboard-only completion and skip, visible focus, readable selected states, announced errors, usable mobile layout, dark mode, reduced-motion compliance. |

## 12. Final implementation report required from Antigravity

Provide: (1) concise user-facing behavior summary; (2) exact files and migration changed; (3) schema/backfill and deployment order; (4) tests and commands actually run with pass/fail outcomes; (5) any remaining limitation or deliberate deviation from this handoff, with reason. Do not call the feature complete until the acceptance matrix is satisfied.
