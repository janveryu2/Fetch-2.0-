# FETCH design system

FETCH preserves Buck the Duck's friendly learning-product structure while replacing its warm orange identity with the uploaded blue pixel mascot as the visual authority.

## Foundations

- **Primary:** `#1065E6`, calibrated against the mascot artwork and used for important actions, active navigation, focus, and progress.
- **Ink:** deep navy for headings and body copy; pure black is avoided.
- **Canvas:** white surfaces over a pale blue ambient background. Borders carry structure; shadows are restrained.
- **Type:** Fredoka for expressive headings and Nunito for clear interface copy.
- **Shape:** 12–16px radii, comfortable touch targets, and rounded controls that retain the original product's approachable character.
- **Imagery:** uploaded FETCH PNGs only. Pixel edges are preserved with `image-rendering`; mascots receive descriptive alt text unless decorative.

The implementation source of truth is the semantic token set in `src/app/globals.css`. Components consume semantic variables rather than introducing page-specific brand colors.

## Interaction

Navigation mirrors the original Home, Progress, StudyPack, Calendar, Live, Friends, and Messages architecture. Desktop uses a persistent left rail; mobile uses a compact bottom bar. Motion is brief and supportive, and `prefers-reduced-motion` disables non-essential transitions.

Every interactive element has a visible focus treatment. Status is communicated in text as well as color. Fixture-only behavior is explicitly labeled so a development interface cannot be mistaken for production persistence or AI generation.

## September 2026 workspace refinement

- Shared navigation uses a 248px desktop rail with Workspace, Study tools, and Community groups; an accessible More drawer exposes all destinations on mobile.
- Page titles use a responsive 1.9–2.6rem Fredoka scale. Nunito remains the interface/reading font. Both fonts are served locally with their licenses.
- `--action-bg`, `--action-hover`, and `--action-text` are stable accessible action pairs. Decorative blue tokens and selected surfaces adapt to dark mode independently.
- CSS base rules belong in the base layer so Tailwind foreground, spacing, and weight utilities can override them intentionally.
- Shared field, segmented-control, notice, and workspace rhythm classes live in `globals.css`. Restrained 150ms dialog motion respects reduced motion.
- Local study data drives summaries, activity, and history. Empty collections are purposeful states with useful next actions.
