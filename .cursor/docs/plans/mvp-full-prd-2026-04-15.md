# MVP Full PRD Implementation Plan

**Goal:** Close gaps in `.cursor/docs/PRD.md` §13 "Not implemented" and §15 acceptance criteria: Industry/PerProfileApplication/Email, JAA API-key auth + agent routes + scoped writes, audit trail + UI, notifications + UI, global search, application bootstrap UX, dashboard metrics, `llm.txt` / `sitemap.xml` / MCP guidance, tests (unit + e2e).

**Current structure (baseline):**
- `crm/` FastAPI: JWT users, Mongo-backed `MongoRepository` (full-collection resync on write), CRUD for Company/Profile/Application, status transitions, mark-applied.
- `app/` React/Vite: shell, companies/profiles/applications lists, mark applied.

**Ordered task groups**

| Group | Scope | Parallel-safe? |
|-------|--------|----------------|
| A | Backend: Pydantic models + enums (Industry, WorkMode, Email kind/status, PPA, cold plan, Audit, Notification, AgentApiKey) | No (foundation) |
| B | Backend: `BaseRepository` + `InMemoryRepository` + `MongoRepository` + `_sync` new collections | After A |
| C | Backend: `deps` (current user, optional admin), agent API key dependency, rate limit helper | After B |
| D | Backend: user routes (industries, extended company/profile, bootstrap application, search, notifications, audit list, PPA + email nested) | After C |
| E | Backend: `/api/v1/agent/*` read-all + scoped writes, pending batch, idempotency stub | After C+D |
| F | Backend: static `GET /llm.txt`, `GET /sitemap.xml`, markdown MCP guidance route | After D |
| G | Backend tests: pytest for transitions, agent auth, scope, bootstrap, notifications | After D+E |
| H | Frontend: types, `api.ts`, new pages (dashboard data, industries, application detail + PPA, audit, notifications), layout nav | After D |
| I | E2E: Playwright against dev servers (or documented skip) | After H |

**TODO checklist**

- [ ] A: Extend `models.py` (and split if file too large)
- [ ] B: Repository methods for new entities; `Application.created_by_user_id`
- [ ] C: Agent key hashing, `get_agent`, rate limit middleware hook
- [ ] D: Wire routes in `main.py` or `routers/`
- [ ] E: Agent routes + policy enforcement
- [ ] F: Agent-friendly surfaces
- [ ] G: `pytest` full suite green
- [ ] H: Frontend pages + tests (Vitest)
- [ ] I: Playwright e2e
- [ ] Update `PRD.md` §13 status when done

**Dependencies / merge risks:** Single branch; repository and models are shared — avoid parallel edits to `repository.py` from multiple agents.

**Acceptance mapping (§15):** Bootstrap create; agent pending fetch + updates; ≥1 PPA visible; mark applied/sent timestamps; theme; CRUD + query; audit actor types; agent read/write scope; PPA `order_index` ordering; audit UI + filters; layout.

---

## Progress log

| Date | Update |
|------|--------|
| 2026-04-15 | Plan created. |
