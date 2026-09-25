# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated and approved: Next.js App Router, TypeScript, Tailwind CSS v4, accessible headless primitives, Phosphor icons, and Supabase for authentication, PostgreSQL, private storage, and realtime features. AI generation is server-side behind a typed provider adapter. OpenAI is the initial provider, enabled only when valid server credentials are configured.

## Users

FETCH serves students who need to turn course material into focused practice quickly. They commonly arrive with a PDF, pasted notes, an article, or a supported video link and need a trustworthy path from source material to questions, grading, review, and measurable progress.

## Product Purpose

FETCH retrieves the important ideas from learning material, turns them into study questions, and helps learners practice until the knowledge sticks. Success means a learner can move from material intake to a saved, reviewable study result without leaving the product.

## Positioning

FETCH combines source-grounded question generation, mixed recall practice, immediate graded feedback, reusable StudyPacks, progress tracking, planning, and social study in one mascot-led experience.

## Operating Context

The primary workflow is: create an account or enter demo mode, add study material, generate a StudyPack, study its questions, receive correct/partial/incorrect feedback, save the attempt, and update progress. Supporting workflows include calendar planning, live competitions, friends, messages, settings, theme, data export, and account management.

## Capabilities and Constraints

- Preserve the incumbent Buck application's information architecture, hierarchy, and recognizable interaction patterns wherever practical.
- All primary interfaces must lead to functioning features, not isolated visual prototypes.
- Private study material, social data, messages, and live rooms require server-side authorization and database row-level security.
- AI generation must be server-side, structured, validated, recoverable, source-grounded, and idempotent.
- When production credentials are absent, development fixtures must be visibly labeled and cannot masquerade as live integrations.
- Pricing, testimonials, adoption numbers, limits, and billing behavior remain unverified until confirmed by the product owner.

## Brand Commitments

- Product and mascot name: FETCH.
- FETCH is a rebranded evolution of Buck the Duck, not a different product.
- The supplied pixel-art dog assets are the visual authority.
- Preserve crisp pixel character while keeping the application interface modern and readable.
- Use a polished blue-and-white system anchored initially near `#1065E6`, refined from the supplied artwork.
- Use Fredoka for brand/display moments and Nunito for interface/body copy.
- Playful copy is welcome when it stays useful. Avoid forced dog puns in errors, settings, legal copy, or destructive actions.

## Evidence on Hand

- Product build brief: `C:\Users\LEGION\Downloads\FETCH-Codex-Master-Build-Prompt.md`
- Mascot archive: `C:\Users\LEGION\Documents\FETCH\Fetch Mascot.zip`
- Six supplied reference screenshots covering the landing page, Home, Progress, Calendar, Live, and Friends.
- Read-only incumbent application: `https://myquiz-app-gamma.vercel.app/`
- No approved testimonials, pricing confirmation, payment provider, legal copy, production AI credentials, or production Supabase credentials have been supplied.

## Product Principles

1. Preserve the learning experience before changing its appearance.
2. Make the next useful study action obvious.
3. Keep generated content grounded in the learner's source.
4. Treat privacy and authorization as product behavior, not backend detail.
5. Let the mascot add warmth at meaningful moments without turning the interface into a toy.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Support complete keyboard operation, visible focus, accessible authentication, reduced motion, labeled controls, error recovery, non-color status cues, safe mobile targets, screen-reader-aware live regions, and alternatives to drag interactions.

## Approved pricing preview — September 2026

The owner approved presentation of FETCH Free (₱0, free forever) and a future FETCH Pro Max (proposed ₱49 one-time). The planned Free offer is 10 AI StudyPacks per calendar month and up to 20 questions per generation; these limits and the advertised future features are not production entitlements in the current demo. Pro Max is coming soon; expanded AI allowances remain undefined, and unlimited generation is not promised. No payment flow is authorized or implemented in this frontend phase.

The completed frontend scope and current preview boundaries are documented in `docs/FRONTEND-REDESIGN-HANDOFF.md`.
