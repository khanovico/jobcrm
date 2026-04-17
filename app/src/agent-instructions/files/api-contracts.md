# JobCRM — JAA (Job Application Agent) HTTP contracts

**Base URL**: `{API_ORIGIN}/api/v1` — replace `API_ORIGIN` (e.g. `http://localhost:8000`).  
**Auth**: every route below requires header `**X-API-Key: <raw_key>`** unless noted.  
**Content-Type**: `application/json` for bodies.  
**Errors**: typically `**401`** (missing/invalid key), `**403**` (scope), `**404**` (entity), `**422**` (validation), `**429**` (rate limit). Success bodies match the **response** shapes below.

OpenAPI with interactive schemas: `**GET {API_ORIGIN}/docs`**.

---

## Health

### `GET /api/v1/agent/health`

**Response 200** — `application/json`

```json
{
  "status": "ok",
  "api": "ok",
  "database": "ok"
}
```

`database` is `"error"` if the repository health check fails.

---

## Applications

### `GET /api/v1/agent/applications/pending`

**Query**


| Param   | Type | Default | Max |
| ------- | ---- | ------- | --- |
| `limit` | int  | 5       | 5   |


**Response 200** — JSON array of **Application** objects (see OpenAPI schema).  
FIFO `**pending_preparation`**, oldest `created_at` first.

---

### `GET /api/v1/agent/applications`

**Query (all optional)**


| Param            | Type        | Notes                                                            |
| ---------------- | ----------- | ---------------------------------------------------------------- |
| `skip`           | int         | Pagination                                                       |
| `limit`          | int         | Max 200 typical                                                  |
| `status_filter`  | enum        | Same values as `ApplicationStatus`                               |
| `exclude_status` | enum        | Exclude rows with this status (e.g. `archived` to hide archived) |
| `company_id`     | uuid string | Filter                                                           |
| `applied`        | bool        |                                                                  |
| `email_sent`     | bool        |                                                                  |
| `sort`           | string      | `created_at_desc` | `created_at_asc` | `updated_at_desc`         |


**Response 200** — JSON array of **ApplicationListItem** (application + `applied_profiles[]`).

---

### `GET /api/v1/agent/applications/{application_id}`

**Path**: `application_id` — string UUID.

**Response 200** — full **Application** (same as user `GET /api/v1/applications/{application_id}`).

**Response 404** — application not found.

---

### `GET /api/v1/agent/applications/{application_id}/per-profile-applications`

**Path**: `application_id` — string UUID.

**Response 200** — JSON array of **PerProfileApplication** for this application, ordered by `order_index` then `created_at`.

**Response 404** — application not found.

---

### `PUT /api/v1/agent/applications/{application_id}`

**Path**: `application_id` — string UUID.

**Request body** — partial **ApplicationUpdate** (all fields optional; only send what changes):

```json
{
  "company_id": "uuid-string",
  "job_post": { "job_link": "https://...", "job_description": "..." },
  "status": "archived",
  "notes": "free text",
  "archive_reason": "optional string when archiving (why removed)"
}
```

**Response 200** — full **Application**.

**Notes**

- Transitions must be **allowed** by server rules; invalid transition → **400** with message.
- To archive: set `"status": "archived"` and optionally `"archive_reason"`.

---

## Companies

### `GET /api/v1/agent/companies/unindexed`

**Query**


| Param   | Type | Default | Max |
| ------- | ---- | ------- | --- |
| `limit` | int  | 5       | 5   |


**Response 200** — JSON array of **Company** with `indexed: false`, oldest first.

---

### `GET /api/v1/agent/companies`

**Query**: `skip`, `limit` (pagination).

**Response 200** — JSON array of **Company**.

---

### `PUT /api/v1/agent/companies/{company_id}`

**Request body** — **CompanyUpdate** (all optional):

```json
{
  "name": "string",
  "indexed": true,
  "website": "https://...",
  "linkedin": "https://...",
  "industry_ids": ["uuid"],
  "hq_locations": ["City"],
  "employee_count_text": "string",
  "actively_hiring": true,
  "work_mode": "remote_us",
  "work_mode_description": "string",
  "overview": "short summary string",
  "full_overview": "https://drive.google.com/...",
  "analysis_links": [{ "topic": "t", "link": "url" }],
  "enrichment_source_links": ["url"]
}
```

**Response 200** — **Company**.

---

### `PATCH /api/v1/agent/companies/bulk`

**Request body**

```json
{
  "updates": [
    { "company_id": "uuid", "payload": { } }
  ]
}
```

`updates`: 1–50 items. Each `payload` is **CompanyUpdate**.

**Response 200** — JSON array of **Company** in request order.

---

## Profiles

### `GET /api/v1/agent/profiles/ids`

**Query**: `skip`, `limit` (max 500).

**Response 200**

```json
{ "profile_ids": ["uuid", "..."] }
```

---

### `GET /api/v1/agent/profiles/{profile_id}`

**Response 200** — **Profile**.

---

### `GET /api/v1/agent/profiles`

**Query**: `skip`, `limit`.

**Response 200** — JSON array of **Profile**.

---

## Per-profile applications

### `POST /api/v1/agent/per-profile-applications`

**Request body** — **PerProfileApplicationCreate** (see OpenAPI). Core fields:

```json
{
  "application_id": "uuid",
  "profile_id": "uuid",
  "order_index": 0,
  "fit_score": 85.0,
  "analysis": "text",
  "tailored_resume_link": "https://...",
  "cold_email_plan": {
    "subjects": ["Subject A"],
    "selected_subject_index": 0,
    "to": { "title": "Hiring Manager", "name": "Jane", "email": "j@co.com" },
    "status": "none"
  },
  "applied": false
}
```

**Response 201** — **PerProfileApplication**.

---

### `PUT /api/v1/agent/per-profile-applications/{ppa_id}`

**Request body** — **PerProfileApplicationUpdate** (optional fields).

**Response 200** — **PerProfileApplication**.

---

## Emails

### `POST /api/v1/agent/emails`

**Request body** — **EmailCreate**:

```json
{
  "per_profile_application_id": "uuid",
  "kind": "cold",
  "content": "email body",
  "lifecycle_status": "drafted",
  "sent": false
}
```

**Response 201** — **Email**.

---

## Notifications

### `POST /api/v1/agent/notifications`

**Request body**

```json
{
  "user_id": "uuid",
  "notification": "APPLICATION_UPDATE | COMPANY_UPDATE | SYSTEM_ERROR | FOLLOW_UP_DRAFT",
  "type": "SUCCESS | FAILED | WARN",
  "timestamp": "optional ISO-8601 datetime (default: server time)",
  "check": false,
  "payload": {
    "id": "uuid-or-string (required for APPLICATION_UPDATE, COMPANY_UPDATE, FOLLOW_UP_DRAFT)",
    "message": "human-readable text"
  }
}
```

`payload.id` meaning: application id, company id, or email id (for `FOLLOW_UP_DRAFT`), depending on `notification`. Optional for some `SYSTEM_ERROR` cases.

**Response 201** — **UserNotification** (includes optional `link` when the server can resolve a path from `notification` + `payload.id`).

---

## Industries

### `GET /api/v1/agent/industries`

**Query (optional)**

| Param    | Type   | Default | Max |
| -------- | ------ | ------- | --- |
| `skip`   | int    | 0       | —   |
| `limit`  | int    | 200     | 500 |
| `search` | string | —       | —   |

**Response 200** — JSON array of **Industry**.

---

### `POST /api/v1/agent/industries`

**Request body** — **IndustryCreate**

```json
{
  "name": "FinTech",
  "description": "Finance and technology"
}
```

**Response 201** — **Industry**

---

### `POST /api/v1/agent/industries/bulk`

**Request body**

```json
{
  "industries": [
    { "name": "FinTech", "description": "Finance and technology" },
    { "name": "HealthTech", "description": "Healthcare technology" }
  ]
}
```

`industries` supports 1–50 entries.

**Response 201** — JSON array of **Industry** in request order.

---

### `PUT /api/v1/agent/industries/{industry_id}`

**Request body** — partial **IndustryUpdate**

```json
{
  "name": "FinTech",
  "description": "Updated industry summary"
}
```

**Response 200** — **Industry**

**Response 404** — industry not found.

---

## Human JWT routes (same API origin)

Register/login and user CRUD use `**Authorization: Bearer <jwt>`**. JAA typically does not call these. Schemas in `**/docs**`.