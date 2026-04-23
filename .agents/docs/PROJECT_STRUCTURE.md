# JobCRM Project Structure

## Root
- `app/` - React + TypeScript frontend (Vite, Tailwind, daisyUI)
- `crm/` - FastAPI backend (JWT auth, CRUD, status workflow)
- `docker-compose.yml` - local orchestration for app, API, and MongoDB
- `.agents/docs/PRD.md` - product requirements reference
- `.agents/rules/` - canonical shared rule bodies for coding assistants
- `.cursor/rules/` - Cursor discovery wrappers that point to `.agents/rules/`

## Backend (`crm/`)
- `app/main.py` - API routes (user + agent + static `llm.txt` / `sitemap.xml` / `mcp-guidance.md`)
- `app/models.py` - Pydantic models (applications, industries, PPA, emails, audit, notifications, agent keys)
- `app/auth.py` / `app/agent_auth.py` - JWT and API key hashing
- `app/deps.py` - JWT user, admin, agent API key + rate limit, repository (Mongo or optional in-memory)
- `app/config.py` - settings (`USE_MEMORY_REPOSITORY` for local E2E)
- `app/repository.py` - `InMemoryRepository` + `MongoRepository` (full-collection sync pattern)
- `app/dev_seed.py` - reusable local dummy-data seeder (company + application + PPAs + emails)
- `app/rate_limit.py`, `app/lifecycle.py` - agent rate limit and preparation-ready notifications
- `scripts/seed_rich_dummy_application.py` - one-command local seed script for full application-detail test data
- `tests/` - pytest (API, transitions, MVP agent flows)

## Frontend (`app/`)
- `src/main.tsx` - app bootstrap and router provider
- `src/App.tsx` - route definitions and auth gate
- `src/auth.tsx` - token/session context
- `src/api.ts` - API client
- `src/components/Layout.tsx` - top nav, sidebar, theme toggle
- `src/pages/` - Dashboard, Login, Companies, Profiles, Applications (+ detail), Industries, Audit, Notifications
- `e2e/` - Playwright smoke (`npm run test:e2e`)
- Vitest: `src/**/*.test.tsx` (vite config excludes `e2e/`)
