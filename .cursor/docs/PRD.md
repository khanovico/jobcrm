# Product Requirements Document (PRD) - JobCRM + JAA

## 1) Product Overview

### 1.1 Product Name
JobCRM

### 1.2 Problem Statement
Managing job applications manually across companies, roles, resumes, and outbound communication is fragmented and time-consuming. Existing tools are either too generic (spreadsheet-like CRMs) or not designed for AI-human collaboration.

### 1.3 Vision
Build a modern, scalable Job Application Tracker + CRM where:
- Human user operates through a clean web UI.
- AI assistant (JAA) acts as an authenticated co-worker that researches, analyzes, drafts, and updates artifacts.
- Both human and AI share the same source of truth for applications, company insights, profile matching, and communication history.

### 1.4 Core Value Proposition
- Centralized application intelligence (company + role + profile fit).
- Faster execution with AI-prepared artifacts (tailored resumes, cold email plans, follow-ups).
- Traceable collaboration with clear state transitions (prepared, applied, emailed, resolved).
- Review-first operations: everything important is visible in one place for fast decision making.

---

## 2) Goals, Non-Goals, and Success Metrics

### 2.1 Goals (MVP -> V1)
- Provide end-to-end Tracker + CRM for job applications, companies, profiles, and communications.
- Enable JAA to securely read/write via dedicated API key-based interface.
- Automate application preparation workflow:
  - Company research enrichment
  - Per-profile matching analysis
  - Top profile selection (1-2)
  - Tailored resume generation and shareable link
  - Cold email strategy + message generation
- Support user confirmation actions:
  - Mark application as applied and stamp `applied_at`
  - Mark email as sent and stamp `sent_at`
- Offer AI-agent-friendly documentation endpoints (`llm.txt`, `sitemap.xml`) and MCP-oriented guidance so agents can self-explore and self-build necessary context/skills for this CRM app.

### 2.2 Non-Goals (Initial Releases)
- Full ATS integrations (Greenhouse, Lever, Workday) in MVP.
- Automatic outbound email sending from CRM in MVP (manual sending + tracking first).
- Multi-user organization permissions beyond simple admin/user roles.
- Advanced analytics dashboards beyond core operational metrics.

### 2.3 Success Metrics
- Time-to-ready: median time from creating application to “Preparation Ready.”
- Throughput: number of prepared applications/week.
- Adoption: percentage of applications with completed AI preparation.
- Quality proxy: percentage of prepared applications that user marks “applied.”
- Communication execution: percentage of generated emails marked “sent.”
- Data completeness: % companies with enriched fields completed by JAA.

---

## 3) Users and Personas

### 3.1 Primary Human Persona
- Job seeker (you), who:
  - Manages target companies and applications.
  - Maintains one or multiple candidate profiles.
  - Reviews AI-prepared assets before execution.

### 3.2 AI Persona
- JAA (Job Application Assistant), which:
  - Polls pending tasks on schedule or on-demand.
  - Enriches company and role context.
  - Produces profile-fit analysis and outreach artifacts.
  - Updates statuses and notifications through authenticated APIs.

---

## 4) Scope

### 4.1 In Scope
- CRUD for `Company`, `Industry`, `Profile`, `Application`, `PerProfileApplication`, `Email`.
- Deletion policy: hard delete only (no soft delete/versioning in MVP).
- User-triggered application creation with minimum input:
  - `company_name`, `company_website` (optional recommended)
  - optional job post data (`job_link`, `job_description`)
- JAA processing pipeline and status updates.
- UI list/detail/edit views for all major entities.
- Search/filter/query interface with scalable pagination.
- Notification mechanism for:
  - Human UI events (to review, action required, completed)
  - Agent API events (task accepted/completed/failed)

### 4.2 Out of Scope
- Recruiting team collaboration features (comments, shared ownership, role-based ACL matrix) in MVP.
- Full campaign automation (scheduled sequence sending + inbox sync).

---

## 5) Product Principles

- Human-in-control: AI prepares, user confirms critical actions.
- Explainable outputs: JAA must store analysis/rationale, sources where possible.
- Secure by default: API-key authentication and audit logging for agent actions.
- Agent-first + human-friendly: all critical capability available via both UI and API.
- Fast workflows: low-friction data entry and minimal-click status updates.
- Tracker-first visibility: UI prioritizes readiness review, draft quality, and communication tracking.

---

## 6) User Journeys

### 6.1 Human Journey - Create and Execute
1. User creates an application:
   - Required: company name
   - Optional: website, job link, raw JD text
2. Application lands in “Pending Preparation.”
3. JAA enriches company + role context, generates profile matches and artifacts.
4. User receives “Preparation Ready” notification.
5. User reviews:
   - Selected profile(s), tailored resume link, cold email plan
6. User executes externally (apply/send email), then marks:
   - `applied = true` -> `applied_at` stamped
   - `email_sent = true` -> `sent_at` stamped
7. JAA may propose follow-up emails for active applications.

### 6.2 Agent Journey - Research and Build
1. JAA authenticates with API key.
2. Fetches and explores data across all entities (read/query across whole CRM).
3. Fetches pending applications (`status = pending_preparation`).
4. Performs company research and updates `Company`.
5. Generates per-profile analysis (`PerProfileApplication` records) with `order_index` for JAA-defined ranking.
6. Selects top 1-2 profile matches and produces:
   - tailored resume link
   - cold email plan (`subjects`, selected subject, recipient, draft emails)
7. Sets application to `preparation_ready`.
8. Optionally monitors “alive” applications and drafts follow-up content.

---

## 7) Functional Requirements

### 7.1 Entity Management (UI + API)
- Create/read/update/delete for all core entities.
- Hard delete required for entity removal in MVP (no soft delete).
- Full entity version history is explicitly out of scope.

### 7.2 Application Workflow
- States:
  - `draft`
  - `pending_preparation`
  - `researching`
  - `analysis_ready`
  - `preparation_ready`
  - `applied`
  - `archived`
- Required transitions must be validated by backend.
- Idempotent state updates for agent retries.

### 7.3 Company Research Enrichment
- JAA writes to optional company fields:
  - LinkedIn, industry tags, HQs, employee size, hiring activity, work mode, overview, analysis links.
- Each enrichment update should capture:
  - `updated_by` (user/jaa)
  - `updated_at`
  - optional `source_links`

### 7.4 Per-Profile Matching
- For each profile, JAA can produce:
  - fit analysis text
  - confidence/score (recommended field)
  - tailored resume link (optional)
  - cold email plan (optional)
- System supports multiple profile analyses per application.
- UI highlights top 1-2 recommendations.

### 7.5 Cold Email and Follow-up
- Cold email plan includes:
  - subject candidates (target 10)
  - selected subject index
  - recipient target (`title`, `name`, optional email)
  - email thread/history
- Email statuses:
  - `drafted`, `sent`, `received`, `timed_out`, `failed`
- Manual “Mark Sent” action stamps `sent_at`.

### 7.6 Notifications
- UI notifications:
  - preparation completed
  - missing required user action
  - follow-up recommendation available
- Agent API notifications/webhooks/events:
  - task accepted
  - task completed
  - task failed with reason

### 7.7 Search, Query, and Exploration
- Global search across companies, applications, profiles.
- Filter facets:
  - application state
  - date ranges
  - industry/work mode/location
  - sent/applied status
- Pagination and sorting required for scalability.

### 7.8 Agent Permissions and Access Model
- JAA permissions:
  - Read/query: all entities and all tracker/CRM views via API.
  - Write: limited to `Company`, `Application`, `PerProfileApplication`, `Email`, and tightly related preparation fields.
- JAA must not modify user identity/security settings.
- Backend enforces agent write scope via middleware + policy layer.

### 7.9 AI-Agent Friendly Surface
- Publish and maintain:
  - `llm.txt` (narrative, operational capabilities, schema hints)
  - `sitemap.xml` (API docs + key UI routes + relevant docs)
- Provide MCP-oriented guidance docs so agents can self-explore workflows and self-build required skills/context about the CRM app.
- Include a concise capability map and entity relationship guide designed for machine parsing.

---

## 8) Data Model (Refined Draft)

Note: This section keeps your structure and adds implementation-safe refinements.

### 8.1 User
- `id`
- `name` (string, required)
- `email` (string, required, unique)
- `password_hash` (string, required, never exposed via API responses)
- `admin` (bool, default false)
- `created_at`, `updated_at`

### 8.2 Company
- `id`
- `name` (string, required, unique-ish with normalization)
- `website` (url, optional)
- `linkedin` (url, optional)
- `industry_ids` (array of `Industry.id`, optional)
- `hq_locations` (array string, optional)
- `employee_count_text` (string, optional)
- `actively_hiring` (bool, optional)
- `work_mode` (`onsite|hybrid|remote_us|remote_eu|remote_global|other`)
- `work_mode_description` (string, optional)
- `overview` (text, optional)
- `analysis_links` (array of `{topic, link}`, optional)
- `created_at`, `updated_at`

### 8.3 Industry
- `id`
- `name` (string, required, unique)
- `description` (long text)

### 8.4 Profile
- `id`
- `name` (required)
- `location`, `email`, `phone`
- `educations` (array of `{university_name, from_year, to_year}`)
- `bio_md` (markdown text)
- `niche_info_md` (markdown text)
- `resume_md` (optional markdown)
- `created_at`, `updated_at`

### 8.5 Application
- `id`
- `company_id` (required)
- `job_post` (optional object):
  - `job_link`
  - `job_description`
- `status` (workflow enum)
- `applied` (bool, default false)
- `applied_at` (datetime, nullable)
- `notes` (optional)
- `created_at`, `updated_at`

### 8.6 PerProfileApplication
- `id`
- `application_id` (required)
- `profile_id` (required)
- `order_index` (int, required, JAA-assigned ascending rank)
- `fit_score` (number 0-100, optional but recommended)
- `analysis` (text, required once generated)
- `tailored_resume_link` (optional)
- `cold_email_plan` (optional object):
  - `subjects` (array string)
  - `selected_subject_index` (int)
  - `to` (`{title, name, email?}`)
  - `status` (`none|received|timed_out|down`)
  - `emails` (array of `Email`)
- `created_at`, `updated_at`

### 8.7 Email
- `id`
- `per_profile_application_id` (required)
- `kind` (`cold|follow_up`)
- `content` (text, required)
- `sent` (bool, default false)
- `sent_at` (datetime, nullable)
- `created_at`, `updated_at`

---

## 9) API and Security Requirements

### 9.1 AuthN/AuthZ
- Human UI auth: session/JWT (implementation choice).
- Human password auth required with secure hash storage (`password_hash`), never plaintext.
- Agent auth: API key required in header for all JAA endpoints.
- Unknown or missing API key requests must be rejected (`401/403`).

### 9.2 API Structure
- Public user APIs and dedicated agent APIs should be logically separated:
  - Example: `/api/v1/...` (user)
  - Example: `/api/v1/agent/...` (JAA)
- Agent endpoints must be idempotent where retries are expected.
- Batch fetch endpoint for pending applications required.

### 9.3 Auditability
- Track `actor_type` (`user|agent`) and `actor_id/key_id`.
- Log state transitions and generated artifacts metadata.
- Audit visibility in UI is required (not logs-only).

### 9.4 Rate Limiting and Reliability
- Apply rate limiting per API key.
- Implement retry-safe processing with deduplication token support.

### 9.5 RBAC and Middleware Enforcement
- Backend must enforce RBAC through middleware for every request.
- Minimum role checks in MVP:
  - `admin = true`: full access.
  - `admin = false`: constrained user access according to policy.
- Agent keys must be mapped to an agent role with explicit write scopes.

---

## 10) UX/UI Requirements

### 10.1 Design Style
- Theme support: light (default) and dark mode.
- Visual direction: simple, sharp, modern.
- Tailwind + daisyUI-based design system tokens/components for consistency and faster UI delivery.
- UI must be optimized for high visibility and fast review workflows (applications, drafts, and email tracking).

### 10.2 Core Screens
- Dashboard: queue, recently prepared, actions needed.
- Companies: list + detail + inline edit.
- Profiles: list + detail + markdown-friendly editing.
- Applications: list + detail with sub-pages.
- Application sub-page - Per-profile analysis: fit rationale, rank/order, resume link, email plan.
- Audit: searchable event timeline with filters.
- Notifications center: user actions required + completion events.

### 10.3 Interaction Rules
- One-click actions for:
  - Mark Applied
  - Mark Email Sent
- Confirmation toast + timestamp visibility immediately after action.

### 10.4 Layout Requirements
- Top navigation bar with:
  - notification icon
  - user menu dropdown
- Left sidebar with pages and sub-pages (including Application sub-pages).
- Main content panel for primary workflows.

---

## 11) Non-Functional Requirements

### 11.1 Performance
- List endpoints should support pagination and indexed filtering.
- P95 API response target:
  - Reads: < 500ms for standard filtered lists
  - Writes: < 800ms for typical updates

### 11.2 Scalability
- Data model and API must support growth to thousands of applications.
- Background workers (for JAA tasks) should be horizontally scalable.

### 11.3 Reliability
- Background processing with retries and dead-letter strategy.
- Graceful failure statuses visible to both UI and agent.

### 11.4 Observability
- Structured logs for API and worker events.
- Basic metrics:
  - queue depth
  - job success/failure rate
  - task processing latency

---

## 12) System Architecture Constraints

- Frontend: React + Tailwind CSS + daisyUI (`app`).
- Backend: FastAPI (`crm`).
- Database: MongoDB.
- Containerization: Docker.
- Monorepo structure with shared docs and conventions.

---

## 13) Implementation Status

This section tracks **what the repository implements today** versus the rest of this PRD. It is updated when major scope lands. **Last reviewed:** April 2026.

### Milestone alignment

| Milestone (see §14) | Status |
|---------------------|--------|
| M1 – Core CRM foundation | **Implemented** (CRUD, workflow, UI shell, bootstrap create, metrics, search) |
| M2 – JAA integration | **Implemented** (API key, `/api/v1/agent/*`, pending batch, scoped writes, rate limit) |
| M3 – Artifacts + execution | **Implemented** (PPA + emails, mark applied / mark sent, notifications on prep ready) |
| M4 – Agent-friendly surfaces | **Implemented** (`llm.txt`, `sitemap.xml`, `mcp-guidance.md`) |

### Implemented

- **Repository layout:** `app/` (React, Vite, Tailwind, daisyUI), `crm/` (FastAPI), MongoDB-backed persistence (or `USE_MEMORY_REPOSITORY` for local E2E), optional `docker-compose` (see `README.md`).
- **Human authentication:** JWT bearer; register/login; password hashing server-side; optional **admin** flag for issuing agent API keys (`POST /api/v1/admin/agent-keys`).
- **Entities (CRUD):** `Industry`, `Company` (extended fields), `Profile` (incl. educations), `Application`, `PerProfileApplication`, `Email` (hard delete).
- **Application workflow:** Validated transitions; `mark-applied`; `mark-email-sent` on application and per-email; `POST /applications/bootstrap` for company name + optional job post.
- **JAA:** `X-API-Key` on `/api/v1/agent/*`; pending applications batch; read + scoped **write** (company, application, PPA, email); per-key rate limiting; audit for agent actions.
- **Notifications & audit:** User notifications (incl. preparation ready); searchable audit timeline API + **Audit** UI; actor type **user** vs **agent**.
- **Search & dashboard:** `GET /search` (companies, profiles, application notes); dashboard metrics endpoint + UI cards.
- **Agent-friendly surfaces:** `GET /llm.txt`, `GET /sitemap.xml`, `GET /mcp-guidance.md`.
- **UI:** Application detail with ordered per-profile rows; industries; audit; notifications; quick-create application form; theme toggle; sidebar + top bar.
- **Tests:** `pytest` (incl. agent flows); `vitest`; Playwright E2E smoke (`npm run test:e2e`).

### Partially implemented / simplified vs PRD

- **Background worker:** No separate worker process; JAA is expected to poll HTTP APIs (horizontal workers remain a future deployment concern).
- **Idempotency / deduplication tokens:** Not implemented (retries rely on validated transitions and idempotent-ish updates).
- **Webhook-style agent events:** Task accepted/completed/failed as discrete webhook payloads is not implemented; audit + notifications cover much of the traceability need.
- **Full-text global search & advanced facets:** Basic search and list filters only; not enterprise-scale search indexing.
- **Rate limiting:** Per API key in-memory (not distributed Redis).

### MVP acceptance (§15)

Criteria are **addressed in product and tests** with the simplifications above; production hardening (distributed rate limits, durable idempotency, worker fleet) is out of MVP scope here.

### Note on ports

The frontend dev server (Vite) defaults to **http://localhost:5173**; the API listens on **http://localhost:8000**. `VITE_API_URL` points the UI at the API; CORS allows the **page origin** (5173), which is distinct from the API port.

---

## 14) Release Plan and Milestones

### Milestone 1 - Core CRM Foundation
- Entity CRUD for company/profile/application.
- Application states + timestamps.
- Basic UI lists/details/edit with Tracker + CRM framing.

### Milestone 2 - JAA Integration
- Agent API-key auth.
- Pending queue endpoints + worker loop.
- Company enrichment + per-profile analysis writes.
- JAA read-all + limited-write policy enforcement.

### Milestone 3 - Artifact Generation and Execution
- Tailored resume link storage.
- Cold email plan + follow-up drafts.
- Mark applied/sent flows with notifications.

### Milestone 4 - Agent-Friendly Surfaces
- Publish `llm.txt` and `sitemap.xml`.
- MCP guidance and API usage docs that support self-exploration/context-building by agents.

---

## 15) Acceptance Criteria (MVP)

- User can create an application with company name and optional job post details.
- JAA can fetch pending applications using API key and update enrichment/analysis.
- At least one per-profile analysis is stored and viewable per prepared application.
- User can mark application as applied and see `applied_at`.
- User can mark an email as sent and see `sent_at`.
- UI supports light/dark theme toggle with light default.
- CRUD and query flows are usable across companies, profiles, and applications.
- Audit trail identifies whether updates were made by user or JAA.
- JAA can read/query all CRM entities and is restricted to approved write scopes.
- Per-profile records include `order_index` and are displayed in that order.
- Audit screen is available in UI with filters for actor, entity, and date range.
- Layout includes top nav, sidebar navigation, and a main content panel.

---

## 16) Risks and Mitigations

- Data quality risk from AI research outputs:
  - Mitigation: capture source links, allow easy user edit and override.
- Over-automation risk for outbound communication:
  - Mitigation: keep manual confirmation before “applied/sent” state.
- API misuse/security risk:
  - Mitigation: scoped API keys, rotation, rate limits, audit logs.
- Schema drift risk in evolving AI outputs:
  - Mitigation: versioned payload schemas and validation contracts.

---

## 17) Open Questions

- When webhook support is introduced, should it be outbound-only (events) or include inbound command handling?
- What is the desired API key lifecycle policy (expiration/rotation cadence) for agent keys?

---

## 18) Future Enhancements (Post-MVP)

- ATS/job board integrations (auto import jobs and application statuses).
- Contact discovery enrichment for better recipient targeting.
- Auto follow-up scheduling recommendations with cadence rules.
- Outcome analytics (response rates by subject/profile/company type).
- Multi-agent orchestration (research agent, writing agent, QA agent).

