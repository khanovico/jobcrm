# MCP / agent guidance

1. Authenticate using `X-API-Key` for `/api/v1/agent/*`.
2. Before coding against the API, load `**/model-architecture.md**` (CRM shape) and `**/api-contracts.md**` (JAA request/response contracts). Use `**{API}/docs**` OpenAPI for exact schemas.
3. Poll the appropriate queue: `GET /api/v1/agent/applications/company-research-pending`, `.../ppa-pending`, or `.../application-pending` (compact task summaries, FIFO, configurable limit). Use `POST /api/v1/agent/workers/assign/{worker_kind}` / `release/{worker_kind}` (kebab-case: `company-researcher`, `ppa-analyser`, `application-drafter`) and optional `GET .../workers/count/{worker_kind}` to track concurrent workers per stage.
4. When you already know an application id, load it directly with `GET /api/v1/agent/applications/{id}` instead of scanning list responses. If you need profile-specific outputs for that application, call `GET /api/v1/agent/applications/{id}/per-profile-applications`.
5. Enrich companies via `PUT /api/v1/agent/companies/{id}` or `PATCH /api/v1/agent/companies/bulk`; queue companies needing research via `GET /api/v1/agent/companies/unindexed` (compact summaries, `research_status=pending`). Fetch full company detail by id before enrichment.
6. Advance applications with validated status transitions via `PUT /api/v1/agent/applications/{id}`. To archive, set `status: archived` and optionally `archive_reason`.
7. Create per-profile rows with `POST /api/v1/agent/per-profile-applications` and emails with `POST /api/v1/agent/emails`.
8. Read `**/llm.txt**` on this app origin for the entry index and quick route list (same host as the UI in local dev).
