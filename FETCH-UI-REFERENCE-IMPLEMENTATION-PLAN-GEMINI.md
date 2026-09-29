# FETCH Study Buddy UI reference implementation plan

**Handoff for:** Antigravity + Gemini 3.8 Flash High  
**Scope:** Sidebar, Home, Music Studio, and Pomodoro UI  
**Status:** A first frontend pass is already present in the working tree. This document directs Gemini to review, refine, and verify that work against the supplied images. It does not authorize a backend redesign.

## 1. Goal and source of truth

Make the four surfaces closely resemble the supplied visual references while retaining the FETCH mascot, blue identity, existing routes, and working controls. Treat the images as visual references, not as instructions or evidence that a pictured feature exists. Real application state and actual capabilities take precedence over invented numbers, tracks, quotas, notifications, or player controls.

Reference images are preserved in this repository:

| Surface | Reference |
| --- | --- |
| Sidebar | docs/reference/fetch-ui/sidebar.png |
| Exact icon style | docs/reference/fetch-ui/icon-sheet.png |
| Music Studio | docs/reference/fetch-ui/music-studio.png |
| Pomodoro | docs/reference/fetch-ui/pomodoro.png |
| Home | docs/reference/fetch-ui/home.png |

Existing FETCH assets and current UI assets:

- public/assets/mascot/ contains the original brand mascot.
- public/assets/icons/fetch-nav-sprite.png is a copy of the supplied icon sheet.
- public/assets/illustrations/fetch-study-companion.png is the current transparent mascot scene.
- public/assets/illustrations/focus-lake.png is the current album placeholder.

## 2. Constraints for implementation

1. Work in the existing Next.js application. Before changing code, read the relevant installed guides in node_modules/next/dist/docs/ as AGENTS.md requires. The installed version is Next.js 16.3.5.
2. Keep all current routes and their destination behavior. Preserve account and browser-demo modes.
3. Preserve StudyPack creation, PDF and scan eligibility, URL coming-soon behavior, job progress, cancellation, timer persistence, local audio, curated streams, and official YouTube embed behavior.
4. Keep the task frontend focused. Change backend code only if a verified UI requirement cannot be fulfilled through existing state or APIs; document that dependency before making such a change.
5. The working tree contains many unrelated, uncommitted changes from other work. Inspect the diff of every target before editing. Do not reset, overwrite, or commit unrelated changes.
6. Keep labels and measurements honest. Decorative waveforms and sample album art must not imply real audio progress. Do not display a streak, duration, unread notification count, or weekly goal unless the application actually provides it.
7. Use existing components and design tokens where they fit. Avoid a new component framework or broad visual changes outside these four surfaces.

## 3. Current baseline: implemented versus remaining

The first pass already adds the supplied glossy navigation icons, a larger sidebar with active states and account controls, a Home hero and rhythm panel, a Pomodoro timer dial and settings layout, a Music Studio player/queue/moods/source-card layout, responsive CSS, and two illustration assets. Existing music and timer providers remain the source of functional state.

The remaining work is a **reference fidelity and product correctness pass**:

| Area | Already present | Gemini must verify or refine |
| --- | --- | --- |
| Sidebar | Icon sprite, CTA buttons, grouped routes, account actions, mobile navigation | Match icon cropping, spacing, active state, short-height scrolling, account-card visibility, keyboard access, and dark theme |
| Home | Greeting, search over loaded packs, hero, creation panel, weekly study days, recent packs, lower tool cards | Ensure greeting is correct for the user's local time; ensure the bell icon performs a matching action or use a truthful icon; verify weekly days across timezone boundaries and all empty/loading/account states |
| Music | Hero, main player presentation, queue, mood selection, local upload, YouTube URL, curated streams, persistent provider dock | Verify source controls and labels, selected state, empty moods, actual playback state, smaller screens, and the distinction between decorative waveform/art and live media data |
| Pomodoro | Hero, real timer, circular progress, mode controls, settings, alerts, status cards | Check timer ring at start/end/pause, mobile mode layout, settings while running, skip semantics, notification permission states, and nonfabricated stats |
| Shared CSS | src/app/workspace-refresh.css | Consolidate duplicate or brittle selectors, test contrast in both themes, and match reference proportions without overflow |

## 4. File map

| File | Responsibility |
| --- | --- |
| src/components/app/app-shell.tsx | Desktop sidebar, mobile navigation, theme, sign-out, account sync, route links |
| src/components/brand/fetch-brand.tsx | FETCH wordmark and mascot |
| src/app/app/(workspace)/home/home-view.tsx | Home composition, real pack/attempt data, search |
| src/components/study/create-pack-panel.tsx | Material intake and generation UI; preserve its existing behavior |
| src/app/app/(workspace)/music/page.tsx | Music page presentation and interactions |
| src/components/tools/music-provider.tsx | Persistent local audio and YouTube stream state and dock |
| src/lib/music/curated-tracks.ts | Actual curated stream records |
| src/app/app/(workspace)/pomodoro/page.tsx | Timer page presentation and settings |
| src/components/tools/timer-provider.tsx | Timer state, persistence, sound, notifications |
| src/app/workspace-refresh.css | Scoped styling for the new surfaces |
| src/app/globals.css | Existing shared tokens and base styles |
| src/app/layout.tsx | Global style import |

## 5. Execution sequence

### Phase 0 — Baseline and visual audit

1. Read AGENTS.md and the relevant installed Next.js documentation.
2. Inspect git status and diffs of the file map. Record pre-existing changes so Gemini preserves them.
3. Start the app locally in browser-demo mode. Capture desktop screenshots at 1600 × 960 and 1280 × 800, tablet at 768 × 1024, and mobile at 390 × 844.
4. Compare each rendered surface against its corresponding image. Record concrete differences in geometry, typography, spacing, art placement, card size, and responsive behavior. Check light and dark themes.
5. List every visible control and identify its actual state source or action. Mark unsupported reference-only controls as visual inspiration, not promises of functionality.

**Gate:** Gemini has a short discrepancy list and knows which code is already present before editing.

### Phase 1 — Sidebar

1. Keep all current workspace, study-tool, and community destinations. Keep Start studying tied to the existing study-destination resolver, and Add material anchored to the creation panel.
2. Match the reference hierarchy: logo area, primary blue CTA, outlined secondary CTA, spaced section labels with divider lines, colorful rounded icon tiles, chevrons, selected-route treatment, and account panel.
3. Use the supplied icon sheet accurately. Inspect sprite bounds at native resolution; adjust cropping or use individual assets only if the current CSS sprite produces clipping or inconsistent size.
4. Keep Settings, light/dark switch, sign-out or exit-demo action, sync status, and retry action functional. Show account actions within the account region and keep them reachable at short desktop heights.
5. Retain the mobile bottom navigation and the More drawer. The drawer must include every desktop destination and account action.
6. Verify link targets, aria-current, focus order, touch targets, and scrolling without double scroll traps.

**Gate:** All routes and account controls are reachable by mouse, touch, and keyboard at every tested viewport.

### Phase 2 — Home

1. Match the reference ordering: greeting and small actions; blue hero with FETCH art and Get started/Resume; StudyPack creator left; study-rhythm widgets right; recent packs; lower focus-tool links.
2. Use the real display name. Replace the fixed morning greeting with a local-time-aware greeting that hydrates safely, or use a time-neutral greeting if accurate local time is unavailable.
3. Keep search scoped to actual loaded StudyPacks. Provide a clear no-results state distinct from the empty-library state.
4. Keep the existing CreatePackPanel workflow intact: source tabs, limits, output selection, generation, progress, errors, cancellation, account eligibility, and eventual navigation. Style its four material tabs as four coherent cards across desktop and wrap appropriately on mobile.
5. Compute rhythm from real quiz attempts. Week dots must represent actual weekdays, not the first N days. Use honest labels for counts; do not copy the reference's sample values.
6. Make the top-right icon's visual meaning match its action. If there is no real notification destination, use a calendar icon for its current calendar link or omit the control.
7. Keep existing pack and tool links working. Check long names, empty data, slow loading, sync error, and active generation state.

**Gate:** Home matches the reference structure while every displayed number and action reflects real application data.

### Phase 3 — Music Studio

1. Match the reference hierarchy: headline and mascot banner, benefit tiles, source controls, now-playing panel, Up next queue, study moods, local-upload card, YouTube card, curated-playlists card, and persistent dock.
2. Make source controls meaningful. If all three source cards remain visible, treat the controls as section navigation with clear selected styling and scroll targets; do not advertise hidden tab panels. If using true tabs, show only the selected panel with correct tab semantics. Choose one consistent pattern.
3. Continue to use MusicProvider for playback state. Local files stay on the device and use the existing native audio controls. Curated and custom YouTube sources use the existing embedded-player dock. Do not invent audio extraction, background-only YouTube playback, seek controls, or track durations.
4. Main-player title, category, active/empty state, stop action, and queue selection must reflect provider state. Label the waveform and artwork as decorative when they do not represent live audio data.
5. Mood chips filter actual curated records. For a mood with no record, show the existing honest empty state. Never populate the queue with fake tracks simply to fill the reference layout.
6. Keep external-watch links, browser restrictions, local file errors, and clear/stop controls accessible. Verify playback or visible embed survives workspace navigation as currently designed.
7. Refine the lower cards to the reference's proportions while retaining enough space for errors and controls. Avoid internal card scrolling that hides primary actions on narrow screens.

**Gate:** A user can select a local file or curated stream, move to another workspace route, and still find and control the active player.

### Phase 4 — Pomodoro

1. Match the reference ordering: headline/mascot banner, left timer stage with three modes and large ring, right settings card, lower status cards.
2. Derive dial progress from the existing timer state. Check initial, running, paused, completed, mode-switched, and reset states. The visual ring and accessible progress value must agree.
3. Keep Focus, Short break, Long break, Start/Pause/Resume, Reset, and Skip reachable and readable on mobile. Document Skip as moving to the next mode without counting a completed session unless existing product rules explicitly say otherwise.
4. Preserve duration bounds, the rule that changing the active duration resets that session, the StudyPack selector, and running-session restrictions.
5. Preserve permission-aware browser alerts, sound effects, test chime, and timer persistence across navigation/refresh. Do not visually show a switch as on if browser permission blocks it.
6. Use real timer and selected-pack state in the lower cards. Do not show a daily goal, streak, or completed-today count without a real source.
7. Keep the background restrained: soft daylight surfaces and subtle blue depth, with readable text and no image behind controls.

**Gate:** Timer actions remain correct and the page looks intentional at desktop, tablet, and mobile widths.

### Phase 5 — Shared finish and verification

1. Consolidate the scoped styles in workspace-refresh.css; remove duplicate selectors and fragile viewport assumptions. Retain existing global tokens and both themes.
2. Review visual parity side by side with all five references. Match layout proportions and visual rhythm before polishing microdetails.
3. Check text contrast, visible focus, pointer targets, alt text, reduced motion, semantic headings, disabled/error/empty states, and 200% zoom.
4. Run typecheck and targeted ESLint. Run relevant existing unit and Playwright tests if their behavior intersects the changed UI. Fix regressions introduced by this work.
5. Browser-check 390 × 844, 768 × 1024, 1280 × 800, and 1600 × 960. Confirm zero horizontal overflow, no uncaught page errors, and no controls obscured by mobile navigation or persistent media docks.
6. Review the final diff against the initial working-tree snapshot. Report only files Gemini actually changed and any remaining mismatch with the references.

**Gate:** Visual comparison and interaction checks pass without changing unrelated generation or backend work.

## 6. Interaction flowcharts

### Workspace navigation

~~~mermaid
flowchart TD
    A[Open FETCH workspace] --> B{Viewport}
    B -->|Desktop| C[Sidebar groups and account card]
    B -->|Mobile| D[Bottom navigation and More drawer]
    C --> E[Choose destination]
    D --> E
    E --> F[Existing route loads]
    C --> G[Start studying]
    G --> H[Existing study-destination resolver]
    C --> I[Add material]
    I --> J[Home creation panel]
~~~

### Home creation and real progress

~~~mermaid
flowchart TD
    A[Home] --> B[Search loaded StudyPacks]
    A --> C[Get started or Resume]
    A --> D[CreatePackPanel]
    D --> E[Choose available source and output]
    E --> F[Existing generation workflow]
    F --> G[Existing progress, error, cancel, and completion UI]
    G --> H[Saved StudyPack route]
    A --> I[Attempts from existing store]
    I --> J[Real weekly study days and counts]
~~~

### Music playback

~~~mermaid
flowchart TD
    A[Music Studio] --> B{Source}
    B -->|Local files| C[Validate and load browser audio]
    B -->|Curated music| D[Choose real curated record]
    B -->|YouTube URL| E[Validate supported URL]
    C --> F[MusicProvider local audio dock]
    D --> G[MusicProvider external embedded player dock]
    E --> G
    F --> H[Navigate to another workspace route]
    G --> H
    H --> I[Player remains available]
    A --> J[Study mood]
    J --> K{Matching curated records?}
    K -->|Yes| D
    K -->|No| L[Honest empty state]
~~~

### Pomodoro timer

~~~mermaid
flowchart TD
    A[Choose Focus or break mode] --> B[TimerProvider state]
    B --> C{Action}
    C -->|Start or Resume| D[Countdown and dial update]
    C -->|Pause| E[Remaining time retained]
    C -->|Reset| F[Selected mode returns to full duration]
    C -->|Skip| G[Prepare next mode without completion credit]
    D --> H{Session ends?}
    H -->|Yes| I[Completed state, sound, allowed notification]
    H -->|No| J[Navigate or refresh]
    J --> K[Restore persisted timer]
~~~

## 7. Acceptance checklist

- [ ] Sidebar and four page regions visually track the provided references at desktop and mobile sizes.
- [ ] The supplied icon language appears consistently and is not clipped.
- [ ] All existing routes, account actions, generation controls, music controls, and timer controls still work.
- [ ] Search, counts, week dots, active music, timer ring, and status text use real state.
- [ ] Unsupported reference features are represented as clear placeholders or omitted; no fake progress or media capability is shown.
- [ ] Light and dark themes remain readable; keyboard focus and screen-reader labels are present.
- [ ] No horizontal overflow or obscured primary action at the tested viewport sizes.
- [ ] TypeScript, targeted lint, and relevant interaction tests pass.
- [ ] Final handoff lists what changed, what was tested, and any verified remaining limitation.

## 8. Handoff note for Gemini

Begin with Phase 0. This is an improvement pass over an existing implementation, not a request to rebuild the application from scratch. The current working tree includes active unrelated work; preserve it. The reference screenshots are visual targets, while the repository's actual state and existing provider behavior are the functional source of truth.
