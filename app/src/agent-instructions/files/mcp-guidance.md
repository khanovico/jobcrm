# MCP / agent guidance

1. Authenticate using `X-API-Key` for `/api/v1/agent/*`.
2. Before coding against the API, load **`/model-architecture.md`** (CRM shape) and **`/api-contracts.md`** (JAA request/response contracts). Use **`{API}/docs`** OpenAPI for exact schemas.
3. Poll `GET /api/v1/agent/applications/pending` for work (max 5 FIFO).
4. Enrich companies via `PUT /api/v1/agent/companies/{id}` or `PATCH /api/v1/agent/companies/bulk`; queue unindexed companies via `GET /api/v1/agent/companies/unindexed`.
5. Advance applications with validated status transitions via `PUT /api/v1/agent/applications/{id}`. To archive, set `status: archived` and optionally `archive_reason`.
6. Create per-profile rows with `POST /api/v1/agent/per-profile-applications` and emails with `POST /api/v1/agent/emails`.
7. Read **`/llm.txt`** on this app origin for the entry index and quick route list (same host as the UI in local dev).
