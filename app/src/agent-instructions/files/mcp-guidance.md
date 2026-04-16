# MCP / agent guidance

1. Authenticate using `X-API-Key` for `/api/v1/agent/*`.
2. Poll `GET /api/v1/agent/applications/pending` for work.
3. Enrich companies via `PUT /api/v1/agent/companies/{id}`.
4. Advance applications with validated status transitions via `PUT /api/v1/agent/applications/{id}`.
5. Create per-profile rows with `POST /api/v1/agent/per-profile-applications` and emails with `POST /api/v1/agent/emails`.
6. Read `llm.txt` on this app origin for a concise capability summary (same host as the UI, not the API port in local dev).
