# Rehearsal

AI war-gaming for high-stakes conversations — practice interviews, negotiations,
and tough conversations against AI agents before they happen for real.

## Repo layout

```
dress_rehearsal/
├── apps/
│   ├── backend/      Next.js, API-only     http://localhost:4000
│   └── frontend/     Next.js, UI-only      http://localhost:3000
├── packages/
│   └── types/        Shared TS types consumed by both apps (@rehearsal/types)
├── .mcp.json         Insforge MCP config (picked up by Claude Code)
└── package.json      npm workspaces root
```

Frontend and backend run as independent Next.js apps so they can be worked on
in parallel. They share nothing at runtime — only TypeScript types.

## Tech

| Layer | Stack |
|-------|-------|
| Simulation engine | Claude API (`@anthropic-ai/sdk`), claude-sonnet-4-6 |
| Database | Insforge (hosted Postgres) via `@insforge/sdk` |
| Parallelism / streaming | Upstash Redis Streams + SSE |
| Web grounding | TinyFish Search API |
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4 |
| Backend | Next.js 16 (API routes + middleware CORS) |

## Quickstart

```bash
# 1. Install everything (one command, hoisted to root node_modules)
npm install

# 2. Populate env vars (see apps/*/.env.local.example)
cp apps/backend/.env.local.example apps/backend/.env.local
cp apps/frontend/.env.local.example apps/frontend/.env.local
# Fill in apps/backend/.env.local with values shared via DM.

# 3. Run backend and frontend in two terminals:
npm run dev:backend    # :4000
npm run dev:frontend   # :3000

# Open http://localhost:3000
```

## What each app needs

### Backend (`apps/backend/.env.local`)

| Var | Source |
|-----|--------|
| `ANTHROPIC_API_KEY` | Anthropic console |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-4-6` |
| `INSFORGE_BASE_URL` | Insforge dashboard |
| `INSFORGE_ANON_KEY` | Insforge MCP → `get-anon-key` (or dashboard) |
| `UPSTASH_REDIS_REST_URL` | Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console |
| `TINYFISH_API_KEY` | `agent.tinyfish.ai/api-keys` (optional — sims still run without it) |
| `ALLOWED_ORIGINS` | Comma-separated list for CORS. Default: `http://localhost:3000` |

### Frontend (`apps/frontend/.env.local`)

| Var | Source |
|-----|--------|
| `NEXT_PUBLIC_API_URL` | Backend URL. Default: `http://localhost:4000` |

## API surface

All routes on the backend:

- `POST /api/scenarios` — create a rehearsal scenario
- `GET /api/scenarios/:id` — fetch scenario + all its sim runs
- `POST /api/scenarios/:id/run` — run one simulation (legacy single-sim path)
- `POST /api/scenarios/:id/run-all` — kick off the 10-parallel batch (runs TinyFish grounding first if not already done)
- `GET /api/scenarios/:id/stream` — SSE tail of the current batch
- `GET /api/health` — liveness probe

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 1: Core scaffolding | ✅ | Insforge schema, scenario form, simulation engine |
| 2: Parallel execution with Redis | ✅ | 10-sim batch, SSE streaming, confidence hash |
| 3: Persona diversity | ✅ | Folded into Phase 2 BATCH_PLAN (5 archetypes × 3 profiles) |
| 4: TinyFish grounding | ✅ | 3 parallel searches + Claude distill → `scenarios.grounding` |
| 5: WunderGraph Cosmo federation | ☐ | |
| 6: Guild.ai persona registry | ☐ | |
| 7: Ghost / TimescaleDB archive | ☐ | |
| 8: Iterate + confidence score | ☐ | Confidence hash already populated; UI bar pending |
| 9: Vapi voice simulation | ☐ | |
| 10: Demo polish | ☐ | |

## Development notes

- Backend CORS is configured via the `ALLOWED_ORIGINS` env var and `apps/backend/src/middleware.ts`.
- SSE requires the origin to appear in `Access-Control-Allow-Origin`; the middleware reflects the request origin when it's in the allowlist.
- Workspaces: both apps resolve `@rehearsal/types` via the monorepo's package.json `workspaces` entry. `transpilePackages` is set in both Next configs so the types package is compiled as part of each app.
- Insforge is managed via MCP during development — see `.mcp.json`. Run `claude /mcp` to authenticate.
