# MCP / agent guidance

1. Authenticate using `X-API-Key` for `/api/v1/agent/*`.
2. Before coding against the API, load `**/model-architecture.md**` (CRM shape) and `**/api-contracts.md**` (JAA request/response contracts). Use `**{API}/docs**` OpenAPI for exact schemas.
3. Poll `GET /api/v1/agent/applications/pending` for work (max 5 FIFO).
4. When you already know an application id, load it directly with `GET /api/v1/agent/applications/{id}` instead of scanning list responses. If you need profile-specific outputs for that application, call `GET /api/v1/agent/applications/{id}/per-profile-applications`.
5. Enrich companies via `PUT /api/v1/agent/companies/{id}` or `PATCH /api/v1/agent/companies/bulk`; queue unindexed companies via `GET /api/v1/agent/companies/unindexed`.
6. Advance applications with validated status transitions via `PUT /api/v1/agent/applications/{id}`. To archive, set `status: archived` and optionally `archive_reason`.
7. Create per-profile rows with `POST /api/v1/agent/per-profile-applications` and emails with `POST /api/v1/agent/emails` (include `subjects`, `selected_subject_index`, and recipient `to` when available).
8. Read `**/llm.txt**` on this app origin for the entry index and quick route list (same host as the UI in local dev).