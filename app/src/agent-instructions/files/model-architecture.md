# JobCRM — data model (JAA-oriented)

This is a conceptual map of the CRM. Authoritative field types and validation live in the API (`GET {JOBCRM_API_ORIGIN}/docs` OpenAPI). Use this document for **relationships and workflows**.

## Core entities

| Entity | Purpose |
|--------|---------|
| **User** | Human login; JWT auth. **Admin** can mint agent API keys. |
| **AgentApiKey** | Hashed key with scopes (`read`, `write`, sometimes `admin`). Sent as `X-API-Key`. |
| **Company** | Employer. **`research_status`**: `pending` → `indexing` → `indexed`. Agent backlog: `GET .../companies/unindexed` returns `research_status=pending`, FIFO. Legacy `indexed` in JSON is mapped to `research_status`. |
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

`company_research_pending` → `company_researching` → `ppa_pending` → `application_pending` → `application_ready` → `archived`

- New applications default from **`company_research_pending`**, unless the company is already **`indexed`**, in which case creation starts at **`ppa_pending`**.
- **`application_ready`** means the human can apply; **Mark applied** (separate flag) stamps **`applied_at`** without a distinct `applied` status value.
- **`archived`** is terminal. Optional **`archive_reason`** on `PUT` when archiving.

Other fields on Application:

- `applied`, `applied_at` — overall application tracking.
- `email_sent`, `email_sent_at` — tracker for outreach (filters available on list APIs).

## Company research (agent)

- **`research_status: pending`** — candidate for `GET /api/v1/agent/companies/unindexed` (max **5**, oldest `created_at` first).
- Agent moves companies through **`indexing`** → **`indexed`** via `PUT /api/v1/agent/companies/{id}` or bulk `PATCH /api/v1/agent/companies/bulk` (legacy **`indexed`** boolean in JSON is still accepted and mapped).

## Workers (concurrency)

- Per pipeline stage: **company researcher**, **PPA analyser**, **application drafter**. Agent **`POST /api/v1/agent/workers/assign/{worker_kind}`** / **`release/{worker_kind}`** (kebab-case paths; release body includes `lease_id`); **`GET /api/v1/agent/workers/count/{worker_kind}`** for active/max; humans configure max slots and **`release-all`** via **`/api/v1/settings/workers`** (JWT).

## Per-profile fields (PPA)

- **`tailored_resume_link`**, **`cold_email_plan`** (subjects, recipient, status) — agent fills for prep.
- **`analysis`**, **`fit_score`** — research output.

## Where to read schemas

- **OpenAPI**: `{JOBCRM_API_ORIGIN}/docs` (e.g. `http://localhost:8000/docs`) — full request/response models.
- **`api-contracts.md`** (this app origin) — JAA-focused contract summary alongside **`llm.txt`**.
