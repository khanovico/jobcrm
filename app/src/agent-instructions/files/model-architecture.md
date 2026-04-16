# JobCRM — data model (JAA-oriented)

This is a conceptual map of the CRM. Authoritative field types and validation live in the API (`GET {JOBCRM_API_ORIGIN}/docs` OpenAPI). Use this document for **relationships and workflows**.

## Core entities

| Entity | Purpose |
|--------|---------|
| **User** | Human login; JWT auth. **Admin** can mint agent API keys. |
| **AgentApiKey** | Hashed key with scopes (`read`, `write`, sometimes `admin`). Sent as `X-API-Key`. |
| **Company** | Employer. `indexed: bool` — agent sets `true` after enrichment; use `GET .../companies/unindexed` for FIFO backlog. |
| **Industry** | Taxonomy; many-to-many with companies via `industry_ids[]`. |
| **Profile** | Candidate/person (resume, bio, niche, contact). |
| **Application** | One job pursuit: links **one Company**, has **status** workflow, optional **job_post**, `archive_reason` when **archived**. |
| **PerProfileApplication (PPA)** | Per candidate within an application: fit, analysis, **tailored_resume_link**, **cold_email_plan**, applied flags. |
| **Email** | Draft/sent mail under a PPA (`kind`: cold / follow_up). |
| **UserNotification** | In-app alerts: `notification` kind, `type` (SUCCESS/FAILED/WARN), `payload` (`id`, `message`), optional `link` resolved server-side. Agent **POST** targets a `user_id`. |
| **AuditEvent** | Append-only trace (`actor_type`: user \| agent). |

## Relationships (simplified)

```
Company 1 ── * Application
Profile 1 ── * PerProfileApplication * ── 1 Application
PerProfileApplication 1 ── * Email
Application * ── 1 Company
```

- An **Application** is the pipeline unit for one company + job context.
- **PPAs** repeat the application for each **Profile** (candidate) you track.
- **Emails** belong to a PPA, not directly to Application.

## Application status workflow

Allowed transitions are enforced server-side (invalid updates return **400**).

Typical progression:

`draft` → `pending_preparation` → `researching` → `analysis_ready` → `preparation_ready` → `applied` → `archived`

- New user-created applications default to **`pending_preparation`**.
- **`archived`** is terminal (no further status moves). Optional **`archive_reason`** explains removal (human UI: “Why remove”; JAA: `archive_reason` on `PUT` when `status` is `archived`).
- **`applied`** may also be set via dedicated “mark applied” endpoints that stamp `applied_at`.

Other fields on Application:

- `applied`, `applied_at` — overall application tracking.
- `email_sent`, `email_sent_at` — tracker for outreach (filters available on list APIs).

## Company indexing (agent)

- **`indexed: false`** — candidate for `GET /api/v1/agent/companies/unindexed` (max **5**, oldest `created_at` first).
- Agent updates company (including **`indexed: true`**) via `PUT /api/v1/agent/companies/{id}` or bulk `PATCH /api/v1/agent/companies/bulk`.

## Per-profile fields (PPA)

- **`tailored_resume_link`**, **`cold_email_plan`** (subjects, recipient, status) — agent fills for prep.
- **`analysis`**, **`fit_score`** — research output.

## Where to read schemas

- **OpenAPI**: `{JOBCRM_API_ORIGIN}/docs` (e.g. `http://localhost:8000/docs`) — full request/response models.
- **`api-contracts.md`** (this app origin) — JAA-focused contract summary alongside **`llm.txt`**.
