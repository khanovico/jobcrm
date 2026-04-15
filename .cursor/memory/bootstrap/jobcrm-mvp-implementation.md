# JobCRM MVP implementation notes

- **In-memory API for E2E:** `USE_MEMORY_REPOSITORY=true` (see `crm/app/config.py`) lets Playwright run against FastAPI without Mongo; do not enable in production.
- **Agent hot path:** `touch_agent_api_key_used` skips full Mongo `_sync` to avoid resyncing the whole DB on every agent request.
- **Vitest vs Playwright:** Exclude `app/e2e/**` in `vite.config.ts` `test.exclude` so `test.describe` specs are not collected by Vitest.
