<div align="center">
  <img src="docs/images/fetch-study-hero.jpg" alt="FETCH, a pixel-art study companion turning notes into a brighter study session" width="100%" />

  <br />

  <img src="public/assets/mascot/fetch-wave-loop.gif" alt="FETCH waving hello" width="148" />

  <h1>FETCH</h1>
  <p><strong>Study smarter. Start with what you already know.</strong></p>
  <p>Bring your course material. Build a StudyPack. Practice with purpose.</p>

  <p>
    <a href="#what-you-can-do">Explore FETCH</a> ·
    <a href="#get-started">Run it locally</a> ·
    <a href="docs/INTEGRATIONS.md">Configure services</a>
  </p>

  <p>
    <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-111827?style=for-the-badge&logo=nextdotjs&logoColor=white" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
    <img alt="Supabase optional" src="https://img.shields.io/badge/Supabase-optional-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  </p>
</div>

---

## A better way to make studying stick

FETCH is a friendly study workspace built around one simple loop: learn from your own material, practice recalling it, and use your results to decide what comes next.

## What you can do

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>✦ Build a StudyPack</h3>
      Turn course notes into focused questions with source-grounded feedback.
    </td>
    <td width="50%" valign="top">
      <h3>↗ See your progress</h3>
      Review completed sessions, accuracy, and the topics that need another look.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>◷ Plan a study session</h3>
      Organize your calendar and stay focused with a flexible Pomodoro timer.
    </td>
    <td width="50%" valign="top">
      <h3>♫ Make it your space</h3>
      Keep your tools close with the AI Tutor and Music Studio.
    </td>
  </tr>
</table>

The app includes a clearly labeled browser-local demo. Supabase and OpenAI integrations add account-backed study features and AI generation when configured. Some social and preview features remain local or unavailable; see the [project overview](docs/FETCH-PROJECT-OVERVIEW.md) for the current boundaries.

## Get started

You’ll need Node.js and npm.

```bash
git clone https://github.com/janveryu2/Fetch-2.0-.git
cd Fetch-2.0-
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The demo works without service credentials.

### Optional: connect services

Copy `.env.example` to `.env.local`, then add your Supabase and OpenAI values:

```bash
# macOS / Linux
cp .env.example .env.local
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

Follow the [integration guide](docs/INTEGRATIONS.md) for setup details. Keep real credentials in `.env.local`; it is ignored by Git.

## Project map

| Folder | What lives there |
| --- | --- |
| `src/app/` | Pages, layouts, and API routes |
| `src/components/` | App shell, authentication, study, and tool UI |
| `src/lib/` | Shared logic, schemas, and service clients |
| `public/` | FETCH artwork and licensed local fonts |
| `supabase/` | Database schema, config, and migrations |
| `tests/` | Unit, API, and browser tests |
| `docs/` | Product, design, setup, and implementation guides |

## Handy commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Check lint rules |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run browser tests |
| `npm run build` | Create a production build |

## Explore the docs

- [Product scope and workflows](PRODUCT.md)
- [Visual design system](DESIGN.md)
- [Project overview and feature boundaries](docs/FETCH-PROJECT-OVERVIEW.md)
- [Integration setup](docs/INTEGRATIONS.md)
- [Prompt maker guide](docs/PROMPT-MAKER-GUIDE.md)
- [Core product surface contract](docs/surfaces/fetch-core.md)

<div align="center">
  <sub>Made for curious minds — one good question at a time.</sub>
</div>
