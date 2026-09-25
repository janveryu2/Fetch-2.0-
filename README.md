# FETCH

FETCH is a study workspace that turns course material into practice questions, grades answers against the source, and helps students track and plan their study.

## Run locally

Requires Node.js and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs in a clearly labeled browser-local demo when service credentials are not configured.

To enable account features and AI generation, copy `.env.example` to `.env.local` and add the required values. See [Integration setup](docs/INTEGRATIONS.md). Never commit `.env.local` or real credentials.

## Included

- Responsive landing page, authentication and account recovery
- StudyPacks, question generation, practice, grading, and progress
- Calendar, AI Tutor, Pomodoro timer, and Music Studio
- Local demo mode and optional Supabase-backed account features
- Unit, API, and browser tests

Some social and preview features are intentionally local or unavailable. See [Project overview](docs/FETCH-PROJECT-OVERVIEW.md) for feature boundaries.

## Project layout

| Path | Contents |
| --- | --- |
| `src/app/` | Next.js routes, pages, layouts, and API handlers |
| `src/components/` | App, auth, brand, study, and tool components |
| `src/lib/` | Shared logic, schemas, and Supabase clients |
| `public/` | Mascot art and licensed local fonts |
| `supabase/` | Database schema, configuration, and migrations |
| `tests/` | Unit and browser end-to-end tests |
| `docs/` | Product overview, design notes, integrations, and guides |

## Useful commands

```bash
npm run dev          # Start the development server
npm run lint         # Check code style
npm run typecheck    # Check TypeScript types
npm test             # Run unit tests
npm run test:e2e     # Run browser tests
npm run build        # Create a production build
```

## Project guides

- [Product scope and workflows](PRODUCT.md)
- [Visual design system](DESIGN.md)
- [Project overview and feature boundaries](docs/FETCH-PROJECT-OVERVIEW.md)
- [Integration setup](docs/INTEGRATIONS.md)
- [Prompt maker guide](docs/PROMPT-MAKER-GUIDE.md)
- [Core product surface contract](docs/surfaces/fetch-core.md)
