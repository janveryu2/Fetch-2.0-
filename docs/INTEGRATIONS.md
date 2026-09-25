# FETCH integrations

## Development fixture

With `FETCH_ENABLE_DEV_FIXTURE=true`, text input creates a deterministic local StudyPack. The interface labels this mode. It is for development and visual testing only; it does not claim to be AI output or durable storage.

## OpenAI generation

Set the server-only `OPENAI_API_KEY` and an explicit `OPENAI_MODEL` in `.env.local`. The generation route uses the Responses API with Zod Structured Outputs, disables response storage, validates the requested question count, and requires a supporting source quote for every answer. The browser never receives the API key.

If either variable is missing in production, generation returns `503` unless the development fixture was deliberately enabled. Provider failures return a generic `502` without leaking credentials or source material into the response.

Reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create).

## Supabase persistence and authentication

Create a Supabase project, then copy its Project URL and publishable key from the Connect dialog into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. This implementation does not need a Supabase secret key: authenticated requests use the user's cookie-backed session and owner-scoped policies. The local development project is configured in the ignored `.env.local` file.

The initial migration generated from `supabase/schemas/core.sql` is `supabase/migrations/20260924003409_initial_study_buddy_schema.sql`; it has been applied to the development project. For schema changes, edit the declarative SQL and generate a reviewed migration with `npx supabase db schema declarative sync --file <migration_name> --no-apply`, then apply pending migrations with `npx supabase db push --linked`. The schema creates the core model, explicit grants, indexes, and RLS policies. Study sources, answer keys, and Tutor conversations live in a non-exposed `private` schema. Narrow private functions verify `auth.uid()` and are called only through authenticated, `SECURITY INVOKER` RPC wrappers. The root Next.js 16 proxy refreshes cookie-backed sessions when credentials exist and becomes a safe no-op when they do not.

Reference: [Supabase SSR authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Study tools

- Authenticated AI Tutor requests use a separate streaming server route, enforce account ownership for any selected StudyPack, limit each account to 10 requests per fixed 10-minute bucket, and save exchanges to private Tutor tables. The user's message and (if selected) up to 12,000 characters of source material are sent to OpenAI; OpenAI response storage is disabled. Add `OPENAI_API_KEY` and `OPENAI_MODEL` to enable replies.
- Tutor history is stored in the user's account and can be resumed from the Tutor page. Unauthenticated demo mode keeps Send disabled.
- The Pomodoro timer stores a deadline-based state in `fetch-focus-v1`. It does not save quiz attempts. StudyPack/calendar data stays in `fetch-development-fixture-v1` only in the clearly labeled demo; signed-in accounts use Supabase.
- Local music uses temporary browser object URLs and native audio playback. No upload, file-content persistence, or new service is involved.
- YouTube URLs are validated against supported HTTPS hosts and rendered using the [official embedded-player format](https://developers.google.com/youtube/player_parameters), with autoplay off and original controls retained. Playback restrictions remain YouTube's responsibility. A normal YouTube link provides recovery when embedding is blocked. Search and stream extraction are not implemented.
- No licensed curated music assets are included. Add appropriately licensed recordings before populating the curated catalog.
- Font files and licenses come from the official Google Fonts repository: `ofl/fredoka` and `ofl/nunito`. They are loaded through `next/font/local` and do not require requests to Google at build or runtime.
