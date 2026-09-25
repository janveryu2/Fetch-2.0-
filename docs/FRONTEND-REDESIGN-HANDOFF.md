# FETCH frontend redesign handoff

Implemented 23 September 2026 in the existing Next.js application. Existing staged work and the handoff ZIP were preserved. No production service or payment flow was deployed. The initial database schema was applied to the development Supabase project on 24 September 2026; no service-role key was saved in the repository.

## What changed

| Surface | Implemented behavior |
| --- | --- |
| Shared workspace | Compact grouped sidebar; readable Start studying action that routes to existing packs or material creation; accessible mobile More drawer; scrollable navigation; theme-aware selected states; persistent light/dark theme. |
| Landing / pricing | Two plans only: FETCH Free at ₱0 and FETCH Pro Max at proposed ₱49 one-time. Planned allowances/features are distinguished from the current demo. Free CTA uses existing app entry. Pro Max is coming soon with no checkout. |
| Home | Compact mascot greeting, first-pack/continue action, actual recent packs and attempt summary, existing pasted-text creation, and links to all four study tools. PDF/link intake is visibly unavailable. |
| Progress | Real consecutive-day streak, completed sessions, questions answered, average accuracy, accessible seven-day activity chart, linked attempt history, and actionable empty state. |
| StudyPacks | Title search, no-results recovery, recent-created/recent-studied sort, creation/last-attempt metadata, Open and Study actions. Pack details show actual last accuracy. Existing practice and result saving remain intact. |
| Calendar | Day/Week/Month/Agenda views, previous/next/Today, local dates, current-day/time indication, hourly placement, overlap lanes, all-day events, local create/edit/delete with confirmation. Editor has type, color, title, date, start/end, course, location, and real pack association. Desktop side panel becomes a keyboard-managed overlay on smaller screens. |
| Live | Branded introduction and two coordinated room cards. Six-character local codes, clipboard feedback, validation against the code created on the current page, and explicit absence of multiplayer. |
| Friends | Refined list/search/profile composition; working All/Online selection; actual username copying; clear feedback for unavailable search, invitation, and profile sharing. No fabricated users or deliveries. |
| Messages | Existing local composition retained; explicitly not delivered. Unavailable conversation search is disabled. Composer handles narrow screens. |
| Settings | Local profile-name save/restore, synchronized theme controls, browser-data JSON export, and explanatory notification/privacy actions. Account deletion remains disabled. |
| AI Tutor | New `/app/tutor` route with mascot welcome, prompt suggestions that fill a draft, context selector, accessible composer and clear/reset. Send is disabled; no artificial AI reply or request. |
| Pomodoro | New `/app/pomodoro` route; Focus/Short break/Long break, bounded duration customization, start/pause/resume/reset, deadline-based timing, completion state, safe refresh restoration, optional pack context and a shared mini timer. No fabricated study attempts. |
| Music Studio | New `/app/music` route; local playlist selection, real browser audio play/pause/seek/volume, previous/next, error handling, and a persistent player above mobile navigation. Temporary object URLs are released. YouTube video/playlist URL validation and official no-autoplay embeds with fallback links. Curated genres have honest empty states. |

## Root-cause corrections

The global unlayered `a { color: inherit }` rule defeated Tailwind text-color utilities. The Study button therefore inherited navy text on its navy background. Moving base link/form rules into the proper CSS layer lets intentional foreground utilities win. Primary action background/foreground tokens are now independent from theme-varying decorative blues, and dark selected surfaces have matching foregrounds.

Fredoka and Nunito previously depended on build-time Google Fonts requests. Those requests failed in this environment, causing fallback typography and a failed production build. Official variable font files and SIL Open Font License notices are now bundled under `public/fonts/` and loaded with `next/font/local`.

Next.js's development indicator overlapped the mobile More destination. `devIndicators: false` removes that floating indicator without hiding compilation/runtime errors.

## New files

- `src/app/app/(workspace)/tutor/page.tsx`
- `src/app/app/(workspace)/pomodoro/page.tsx`
- `src/app/app/(workspace)/music/page.tsx`
- `src/components/landing/pricing.tsx`
- `src/components/tools/timer-provider.tsx`
- `src/components/tools/music-provider.tsx`
- `src/lib/focus-timer.ts`
- `src/lib/study-stats.ts`
- `src/lib/calendar-layout.ts`
- `src/lib/youtube.ts`
- `src/lib/study-tools.test.ts`
- `tests/e2e/redesign.spec.ts`
- `public/fonts/Fredoka-variable.ttf` and `Fredoka-OFL.txt`
- `public/fonts/Nunito-variable.ttf` and `Nunito-OFL.txt`
- This handoff document.

## Existing files modified

- `next.config.ts`
- `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- `src/app/app/(workspace)/layout.tsx`
- Workspace page files for Home, Progress, StudyPacks, Calendar, Live, Friends, Messages, and Settings.
- `src/components/app/app-shell.tsx`, `src/components/app/demo-provider.tsx`
- `src/components/ui/button.tsx`
- `src/components/study/create-pack-panel.tsx`, `study-pack-detail.tsx`, `study-session.tsx`
- `src/lib/demo-types.ts`
- `README.md`, `DESIGN.md`, `PRODUCT.md`, `docs/INTEGRATIONS.md`, `docs/FETCH-PROJECT-OVERVIEW.md`, and `docs/PROMPT-MAKER-GUIDE.md`.

Calendar fields are optional additions to the existing local event model. Previously stored date-only events display as all-day events; editing updates the same ID and storage key rather than creating another store.

## Preview boundaries and remaining integrations

- Tutor sends no requests. Production tutoring still needs authenticated/authorized context, private answer handling, a server-side provider, rate limits, error handling, and conversation persistence.
- PDF/link extraction, manual flashcard authoring, Smart Review, advanced analytics, custom tests, expanded generation and plan enforcement remain planned. The current local generator UI supports 3–12 questions; fixture output can be smaller depending on source material.
- Friends, shareable profiles, delivered messages, and multiplayer need authenticated server persistence and authorization. Local room codes are page-local demonstrations, not joinable remote rooms.
- Browser storage is not cross-device persistence. Local audio is not stored or uploaded and must be selected again after refresh; supported formats depend on the browser. Changing tracks requires an explicit Play action.
- YouTube embedding uses the [official player URL format](https://developers.google.com/youtube/player_parameters), retains native controls, and does not extract streams. URL handling, iframe construction, and fallback controls are tested; actual external video availability/playback is not certified. Owners, browsers, network restrictions, or YouTube may block playback. No API key is needed for this URL-based embed.
- No licensed curated recordings were supplied, so there are no pretend playable tracks.
- Calendar timed events are same-day only. Recurrence, cross-midnight events, drag/resize, and server synchronization are outside this phase.
- No checkout, purchase simulation, paid entitlement, or unlimited-AI claim is present.

## Verification

Final results on 23 September 2026:

| Check | Result |
| --- | --- |
| npm run lint | Passed, no lint errors or warnings. |
| npm run typecheck | Passed. |
| npm test | 9 tests passed across 2 files. |
| npm run test:e2e | 23 passed; 1 intentional skip because the mobile drawer test does not apply to desktop. |
| npm run build | Passed; all 19 static pages generated and dynamic routes compiled. |
| git diff --check | Passed. Git reports only the repository's usual LF-to-CRLF notices. |
| Impeccable mechanical detector | No findings on inspected changed UI targets. |

Browser coverage includes original entry/creation flows, a completed mixed-question practice session and saved progress, search recovery, four-view calendar CRUD/persistence/date navigation/validation, timer start/pause/resume/reset/completion, actual local WAV playback/pause/seeking/volume/playlist/navigation, clipboard reads verifying copied text, safe YouTube URL and embed construction, pricing, Tutor draft controls, and mobile theme persistence.

All eleven workspace routes were checked at 1440, 1024, 768, and 390 CSS pixels for unintended horizontal overflow. Automated axe checks passed for light/dark workspace surfaces at desktop/mobile sizes, and for both pricing and the event editor. Screenshots of desktop/mobile light/dark pages were captured and visually inspected, including pricing and calendar editor states. YouTube network responses were isolated in the embed test; live external video playback was not claimed.

The initial browser launch needed sandbox elevation; it was rerun successfully. The initial Google Fonts build failure was resolved by bundling licensed local fonts. The existing Vitest/Vite configuration prints a non-failing future loader warning. Browser screenshots are generated under ignored `test-results/visual/`; they cover all eleven workspace destinations in light/dark themes on desktop/mobile. Layout overflow checks additionally cover 1024px and 768px. Automated accessibility checks are useful evidence, not a claim of a complete manual WCAG audit.

## Account services implementation — 24 September 2026

The next milestone has been implemented in the application and schema source:

- Email/password sign-in and account creation now call Supabase Auth. Email confirmation, password recovery, reset, and sign-out use cookie-backed sessions.
- Account StudyPacks and source material are created in one database function call. The RPC returns prompts and choices only; answer keys remain in `private.question_keys`. The server checks each submitted answer and calculates the score before it writes an attempt.
- Calendar event CRUD uses the signed-in user's RLS session and stores local date/time, all-day state, color, subject, location, and an optional pack link.
- Tutor replies run through `/api/tutor` with bounded inputs, a per-account database quota, owner checks for pack context, disabled provider response storage, and private conversation history.
- The local demo still uses its separate browser store. Workspace APIs check the signed-in user's verified claims and use explicit owner filters in addition to RLS.

`supabase/schemas/core.sql` is the declarative schema source, and `supabase/migrations/20260924003409_initial_study_buddy_schema.sql` is its generated initial migration. The migration is applied to the linked development project (`bwcjwxzfppwasvfasopv`); local and remote migration histories match. All 15 application tables have RLS enabled, and Supabase's security and performance advisors found no warning-level issues. The ignored local `.env.local` has the project's URL and publishable key; no service-role key is stored there. Auth callback allowlists and real account-flow verification remain to be completed. `OPENAI_API_KEY` and `OPENAI_MODEL` are not configured, so live generation and Tutor responses still need provider setup. Demo mode remains available.

Code verification on 24 September: `npm run typecheck`, `npm run lint`, and `npm run build` passed with the development Supabase configuration. The migration was reviewed, applied, and confirmed in remote history; RLS was confirmed on all application tables. The next backend step is to configure Auth redirects and verify signup, login, recovery, and owner-scoped requests with test accounts. The service-role key was not used or stored. PDF/URL extraction, plan enforcement, and payments remain separate work.
