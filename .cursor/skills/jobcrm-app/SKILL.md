---
name: jobcrm-app
description: "JobCRM Agent HTTP API for external automations and worker clients. Use when an app or agent must authenticate, read queues, lease workers, and mutate applications without the human web UI."
---

# JobCRM Agent API (external client)

## What / when

**Environment (set on the agent host):**

| Variable | Role |
|----------|------|
| `JOBCRM_API_ORIGIN` | API server origin (no trailing slash), e.g. `https://api.jobcrm.example.com` |
| `JOBCRM_X_API_KEY` | Secret for **`X-API-Key`** on every `/api/v1/agent/*` request (`read` / `write` / `admin` scopes; `admin` = all) |
| `JOBCRM_APP_URL` | Web app origin (no trailing slash) — use to **fetch app-side docs** or UI-linked assets; **not** the agent API base |

- **Agent API prefix:** `$JOBCRM_API_ORIGIN/api/v1/agent` — all paths in the table below are appended to this prefix.
- **Auth header:** `X-API-Key: $JOBCRM_X_API_KEY`
- **JSON:** mutating requests need `Content-Type: application/json`.
- **Use** the agent API to poll work, lease workers, read/write companies, applications, PPAs, emails, industries, and notifications — without the human JWT UI.

---

## Errors

| HTTP | Meaning |
|------|---------|
| 401 | Bad/missing API key |
| 403 | Key cannot do this operation (scope) |
| 404 | Missing resource or lease |
| 400 | Validation / illegal transition (`detail`) |
| 409 | Worker pool full (assign) |
| 429 | Rate limit — backoff + jitter |

---

## Endpoints (path + query + body together)

**Path** = suffix after **`$JOBCRM_API_ORIGIN/api/v1/agent`**.  
**Body** = tight JSON (`POST`/`PUT`/`PATCH`); omit keys you do not send; **—** = no body. Enum string values → **Enum reference**. Extra rules → **Description**.

| Method | Path | Query | Body | Description |
|--------|------|-------|------|-------------|
| GET | `/health` | — | — | Smoke-test API and DB before work. |
| GET | `/workers/count/{worker_kind}` | — | — | Read active vs max slots before assigning. |
| POST | `/workers/assign/{worker_kind}` | — | — | Acquire a lease; use before gated pipeline work. **409** if pool full. Response `{"lease_id":""}`. |
| POST | `/workers/release/{worker_kind}` | — | `{"lease_id":""}` | Release lease; must be same API key that assigned. |
| GET | `/applications/company-research-pending` | `limit` default 5, max 50 | — | Queue for company research stage. |
| GET | `/applications/ppa-pending` | `limit` default 5, max 50 | — | Queue for per-profile analysis stage. |
| GET | `/applications/application-pending` | `limit` default 5, max 50 | — | Queue for application drafting stage. |
| GET | `/companies` | `skip`, `limit` | — | List companies (pagination). |
| GET | `/companies/unindexed` | `limit` default 5, **max 5** | — | Next companies needing indexing or enrichment. |
| PATCH | `/companies/bulk` | — | `{"updates":[{"company_id":"","payload":{}}]}` | 1–50 items. `payload` same optional keys as **PUT `/companies/{id}`** body; partial per item. |
| PUT | `/companies/{company_id}` | — | `{"name":"","research_status":"","website":"","linkedin":"","industry_ids":[],"hq_locations":[],"employee_count_text":"","actively_hiring":null,"work_mode":"","work_mode_description":"","overview":"","full_overview":"","analysis_links":[{"topic":"","link":""}],"enrichment_source_links":[]}` | Partial update — include only keys you change. `research_status` → **research**; `work_mode` → **work**; `analysis_links` is an array of `{topic,link}`. |
| GET | `/profiles/ids` | `skip`, `limit` default 200, max 500 | — | Profile id list only (lightweight iteration). |
| GET | `/profiles` | `skip`, `limit` | — | List profiles. |
| GET | `/profiles/{profile_id}` | — | — | One profile (bio, resume, etc.). **404** if frozen or missing. |
| GET | `/applications` | `skip`, `limit`, `status_filter`, `exclude_status`, `company_id`, `applied`, `email_sent`, `sort` | — | Filtered list. `sort` → **sort_app**. |
| GET | `/applications/{application_id}` | — | — | One application + job post. |
| PUT | `/applications/{application_id}` | — | `{"company_id":"","job_post":{"job_link":"","job_description":""},"status":"","notes":"","archive_reason":""}` | Partial. `status` → **app_status**; transitions validated server-side. Use `archive_reason` when moving to `archived`. |
| GET | `/applications/{application_id}/per-profile-applications` | — | — | All PPAs for this application. |
| POST | `/per-profile-applications` | — | `{"application_id":"","profile_id":"","order_index":0,"fit_score":null,"analysis":"","tailored_resume_link":"","cold_email_plan":{},"applied":false,"applied_at":null}` | Create row. **Required:** `application_id`, `profile_id`. `fit_score` 0–100 or `null`. `cold_email_plan` → **cold_plan**. |
| PUT | `/per-profile-applications/{ppa_id}` | — | `{"profile_id":"","order_index":0,"fit_score":null,"analysis":"","tailored_resume_link":"","cold_email_plan":{},"applied":false,"applied_at":null}` | Partial; `cold_email_plan` → **cold_plan**. |
| POST | `/emails` | — | `{"per_profile_application_id":"","kind":"","content":"","lifecycle_status":"","sent":false,"sent_at":null}` | `kind` → **email_kind**; `lifecycle_status` → **email_life** (default `drafted`). `sent_at` ISO datetime or `null`. |
| POST | `/notifications` | — | `{"user_id":"","notification":"","type":"","timestamp":null,"check":false,"payload":{"id":"","message":""}}` | `notification` → **notif_kind**; `type` → **notif_sev**. Optional `timestamp` (ISO). If `notification` is `APPLICATION_UPDATE`, `COMPANY_UPDATE`, or `FOLLOW_UP_DRAFT`, `payload.id` must be non-empty; if `SYSTEM_ERROR`, `payload.id` may be omitted. |
| GET | `/industries` | `skip`, `limit`, `search` | — | Search or list industries. |
| POST | `/industries` | — | `{"name":"","description":""}` | Create one. `name` length 1–200. |
| POST | `/industries/bulk` | — | `{"industries":[{"name":"","description":""}]}` | 1–50 rows. |
| PUT | `/industries/{industry_id}` | — | `{"name":"","description":""}` | Partial; send at least one key to change. |

**`{worker_kind}`** (path segment, exact): `company-researcher` | `ppa-analyser` | `application-drafter`

**Responses (short):** `GET /health` → DB status; `POST /workers/assign/...` → `{"lease_id":"..."}`; `GET /workers/count/...` → `{"active":n,"max":m}`; other routes return the resource JSON as defined by the server.

---

## Enum reference

| Tag | Allowed values |
|-----|----------------|
| **app_status** | Main pipeline: `company_research_pending` → … → `application_ready` → `archived`. Also `invalid` (terminal except → `archived`); setting company **research** to `invalid` moves non-archived apps for that company to `invalid`. |
| **sort_app** | `created_at_desc` (default), `created_at_asc`, `updated_at_desc` |
| **research** | `pending`, `indexing`, `indexed`, `invalid` |
| **work** | `onsite`, `hybrid`, `remote_us`, `remote_eu`, `remote_global`, `other` |
| **email_kind** | `cold`, `follow_up` |
| **email_life** | `drafted`, `sent`, `received`, `timed_out`, `failed` |
| **notif_kind** | `APPLICATION_UPDATE`, `COMPANY_UPDATE`, `SYSTEM_ERROR`, `FOLLOW_UP_DRAFT` |
| **notif_sev** | `SUCCESS`, `FAILED`, `WARN` |
| **cold_plan** | `{ "subjects": string[], "selected_subject_index": number, "to": null \| { "title", "name", "email"? }, "status": "none"\|"received"\|"timed_out"\|"down" }` |

---

## Suggested call sequence

1. `GET $JOBCRM_API_ORIGIN/api/v1/agent/health` (header `X-API-Key: $JOBCRM_X_API_KEY`)
2. Optional lease: `GET`/`POST` …`/workers/count|assign/{worker_kind}` (same auth)
3. Pull queue: `…-pending` or `GET` …`/applications` with filters
4. `PUT`/`POST`/`PATCH` per **Body** column
5. `POST` …`/workers/release/{worker_kind}` with `{"lease_id":"…"}`
6. On 429: backoff + jitter. Never log `JOBCRM_X_API_KEY`.
7. App-only docs or static help: resolve under **`$JOBCRM_APP_URL`** (not under `JOBCRM_API_ORIGIN`).
