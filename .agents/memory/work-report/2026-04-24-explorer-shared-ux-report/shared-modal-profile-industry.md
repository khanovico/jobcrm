# Shared destructive/modal/profile/industry audit plan

Date: 2026-04-24
Branch context: integration `codex/ux-performance-audit`, active `codex/uxperf-batch-6-agent-detail-hotpaths`
Scope: UXPERF-020, UXPERF-021, UXPERF-025, UXPERF-034, UXPERF-039, UXPERF-042, UXPERF-043, UXPERF-044, UXPERF-046
Mode: read-only planning

## Graph-first notes

- Code-review-graph shows shared pressure around `components-modal`, `pages-when`, and `src-application`.
- Biggest conflict magnets in scope:
  - `app/src/pages/CompanyDetailPage.tsx::CompanyDetailPage` (613 lines)
  - `app/src/pages/ApplicationDetailPage.tsx::ApplicationDetailPage` (526 lines)
  - `app/src/pages/IndustriesPage.tsx::IndustriesPage` (382 lines)
  - `app/src/pages/ProfileDetailPage.tsx::ProfileDetailPage` (372 lines)
  - `app/src/pages/CompaniesPage.tsx::CompaniesPage` (361 lines)
  - `app/src/pages/ProfilesPage.tsx::ProfilesPage` (176 lines)
- Shared modal infra already fans out to `CompaniesPage`, `NewApplicationModal`, `ArchiveApplicationModal`, `ArchiveCompanyModal`, `ClearApplicationToPendingModal`, `ClearCompanyResearchModal`, `ApplicationWorkflowOverrideModal`, `NotificationsPage`, `SettingsPage` via `app/src/components/Modal.tsx`.

## Ticket map

### Batch A: shared destructive modal safety
Best combined batch: UXPERF-020, UXPERF-025, UXPERF-034, UXPERF-039, UXPERF-042

Why together:
- Same user problem: destructive close/confirm flows too easy to misfire.
- Same infra seam: `app/src/components/Modal.tsx`.
- Same implementation style likely needed: explicit confirm copy, submitting lock, dirty-close guard, focus return, typed confirmation for high-impact actions.

Primary files / functions:
- `app/src/components/Modal.tsx`
  - `Modal` at lines 27-79
  - Today it routes close button, Esc, backdrop, and programmatic close through one unconditional `onClose()` path (`onCancel` at 58-61, backdrop form at 72-75, close event at 40-47).
- `app/src/components/NewApplicationModal.tsx`
  - `NewApplicationModal`
  - Resets form in `closeModal()` after any close path; direct UXPERF-025 consumer.
- `app/src/pages/CompaniesPage.tsx`
  - `onSubmit` at 125-153
  - create-company modal at 307-360
  - archived restore currently hidden behind same submit button and state flip (`awaitingArchivedRestore`).
- `app/src/components/ClearApplicationToPendingModal.tsx`
  - `ClearApplicationToPendingModal` at 18-82
  - current label still "Clear and reset".
- `app/src/pages/ApplicationDetailPage.tsx`
  - status action button at 276-281 shows `"Clear"`
  - email delete action at 406-425 still native confirm
- `app/src/components/ClearCompanyResearchModal.tsx`
  - `runClear` at 60-73
  - ambiguous copy/buttons at 95-147 (`Archive`, `Clear`, `Clear company`)
- `app/src/pages/ProfileDetailPage.tsx`
  - `onDelete` at 193-203 uses native confirm
- `app/src/pages/ProfilesPage.tsx`
  - freeze/unfreeze at 115-131
  - delete at 132-147
- `app/src/pages/IndustriesPage.tsx`
  - `removeIndustry` at 144-160 uses native confirm

Implementation notes:
- Add modal-level close interception API first, then migrate callers one by one.
- Keep destructive confirmation UX tiered:
  - plain confirm modal: profile freeze / industry delete / email delete
  - stronger confirm with typed input: clear company research when related count > 0, clear/reset application prep, company restore, profile delete if tied data impact is shown
- Rename action labels before wiring typed confirm, or tests/copy will churn twice.

Conflict risk:
- High. `Modal.tsx` change affects many consumers beyond this cluster.
- High. `CompaniesPage.tsx`, `ApplicationDetailPage.tsx`, and `ProfileDetailPage.tsx` are large pages with likely concurrent edits.
- Medium. Copy-only modal work on `ClearApplicationToPendingModal.tsx` and `ClearCompanyResearchModal.tsx` is isolated once modal API stabilizes.

Suggested tests:
- New: `app/src/components/Modal.test.tsx`
  - Esc/backdrop/close-button blocked when dirty
  - opener focus restored on close
- Extend: `app/src/components/ClearCompanyResearchModal.test.tsx`
  - explicit button labels
  - typed confirmation gate when related count > 0
- Extend: `app/src/pages/ApplicationDetailPage.test.tsx`
  - renamed reset button
  - email delete uses app modal, not `window.confirm`
- Extend: `app/src/pages/ProfilesPage.test.tsx`
  - freeze/delete open app confirm modal
- Extend: `app/src/pages/ProfileDetailPage.test.tsx`
  - delete modal
- Extend or add: `app/src/pages/CompaniesPage.test.tsx`
  - archived-company restore uses dedicated restore modal with archive reason/details
- Extend: `crm/tests/test_api.py`
  - only if typed-confirm design adds server payloads; current backend already covers clear/reset/archive behavior

### Batch B: profile workflow and findability
Best combined batch: UXPERF-021, UXPERF-043, UXPERF-044

Why together:
- Same entity owner: profiles.
- Same files: `ProfilesPage.tsx`, `ProfileDetailPage.tsx`, profile list endpoints.
- UXPERF-021 and UXPERF-044 overlap heavily; do not split.

Primary files / functions:
- `app/src/pages/ProfileDetailPage.tsx`
  - `onCreate` at 130-162 navigates away after save
  - `onSaveEdit` at 164-191 navigates away after save
  - main single-card form begins at 221
- `app/src/pages/ProfilesPage.tsx`
  - `load` at 20-37 only sends `skip` and `limit`
  - no search or frozen filter UI in current table section
- `app/src/api.ts`
  - `listProfileSummaries` already accepts arbitrary `URLSearchParams`
- `crm/app/main.py`
  - `list_profiles` at 533-541
  - `list_profile_summaries` at 544-552 already accepts `search`
- `crm/app/repository.py`
  - `InMemoryRepository.list_profiles` at 776-786 currently searches only `name`
  - `MongoRepository.list_profiles` at 1769-1783 currently searches only `name`

Implementation notes:
- Server search/filter work needed for UXPERF-043 if scope includes name/location/email and frozen/active filter from audit note.
- Save-in-place and dirty-guard work should be designed once for create and edit paths.
- If form segmentation lands (tabs/sections), reuse dirty-state model from Batch A modal guard work, but keep profile route guard separate from modal close guard.

Conflict risk:
- High inside `ProfileDetailPage.tsx`; page already large and likely to grow more if split into sections/tabs.
- Medium in `ProfilesPage.tsx`; list page small but likely shared with any profile-search or role-visibility work.
- Medium in backend repositories because both in-memory and Mongo implementations must stay aligned.

Suggested tests:
- Extend: `app/src/pages/ProfileDetailPage.test.tsx`
  - stays on detail after save
  - shows saved state/timestamp
  - warns on dirty navigation
- Extend: `app/src/pages/ProfilesPage.test.tsx`
  - sends `search` and frozen filter params to `/api/v1/profiles/summary`
  - list updates without breaking pagination
- Extend: `crm/tests/test_api.py`
  - human endpoint search matches name/location/email
  - frozen/active filter semantics
- Extend: existing Mongo query test around `test_mongo_repository_list_profiles_uses_query_pagination` for expanded search/filter behavior

### Batch C: industry list/picker consistency
Best combined batch: UXPERF-046

Optional pairing:
- Pair with UXPERF-020 industry delete modal only if same engineer owns `IndustriesPage.tsx`.
- Do not parallelize with Batch A if both need significant `IndustriesPage.tsx` edits.

Primary files / functions:
- `app/src/pages/IndustriesPage.tsx`
  - `load` at 27-40 hard-caps visible results with `limit=200`
- `app/src/pages/CompanyDetailPage.tsx`
  - `loadCompanyContext` at 82-105 calls `getAllIndustries()`
- `app/src/state/industryCatalog.ts`
  - `fetchAllIndustries` at 26-43 walks every industry page until exhaustion
- `app/src/api.ts`
  - `listIndustries`
- `crm/app/main.py`
  - `list_industries` at 228-236 already supports `skip`, `limit`, `search`
- `crm/app/repository.py`
  - `InMemoryRepository.list_industries` at 497-503
  - Mongo list implementation also already paginates/searches; frontend is main inconsistency

Implementation notes:
- Audit direction points to standardizing on search + pagination + selected-item hydration, not full catalog fetch.
- `CompanyDetailPage` should stop depending on `getAllIndustries()` for picker boot.
- Likely outcome:
  - bounded search-driven industry picker for company detail
  - paginated/searchable industries admin page
  - optional lightweight selected-id hydration endpoint or reuse current list endpoint with targeted ids

Conflict risk:
- High on `CompanyDetailPage.tsx` because file is 613 lines and already carries application list + research actions.
- Medium on `industryCatalog.ts`; changing this cache affects any industry consumer.
- Medium on `IndustriesPage.tsx`; UXPERF-020 also touches same file.

Suggested tests:
- Extend: `app/src/pages/IndustriesPage.test.tsx`
  - paginated/search path
  - no fixed 200-only assumption
- Extend: `app/src/pages/CompanyDetailPage.test.tsx`
  - avoid full-catalog fetch loop
  - selected industries still render when only partial option set loaded
- Add frontend test around new bounded industry picker component if extracted
- Extend backend tests only if API surface changes; current endpoint contract already supports bounded reads

## Exact backend facts worth carrying into implementation

- Profile summary API already supports `search`, but backend search is name-only today:
  - `crm/app/main.py:544-552`
  - `crm/app/repository.py:776-786`
  - `crm/app/repository.py:1769-1783`
- Mongo test already guards pagination + `include_frozen=False` query shape:
  - `crm/tests/test_api.py:1742-1770`
- Clear-company backend semantics already covered:
  - `crm/tests/test_api.py:409-520`
- Industry API already supports bounded pagination/search:
  - `crm/app/main.py:228-236`
- Frontend still defeats that bounded contract in company detail by loading the whole catalog:
  - `app/src/state/industryCatalog.ts:26-57`
  - `app/src/pages/CompanyDetailPage.tsx:82-105`

## Efficient batching recommendation

If one engineer:
1. Batch A first: UXPERF-020 + UXPERF-025 + UXPERF-034 + UXPERF-039 + UXPERF-042
2. Batch B second: UXPERF-021 + UXPERF-043 + UXPERF-044
3. Batch C third: UXPERF-046

If parallelizing:
- Worker 1: Batch A
- Worker 2: Batch B
- Worker 3: Batch C only after confirming no concurrent `IndustriesPage.tsx` edits from Batch A

Avoid parallel splits:
- UXPERF-021 separate from UXPERF-044: same save/dirty/navigation seams
- UXPERF-034 separate from UXPERF-042: same destructive reset vocabulary and confirmation pattern
- UXPERF-020 spread across multiple workers: shared modal API change will conflict

## Current non-scope worktree notes

- Dirty working tree files seen during audit:
  - `.agents/rules/memory-preservation.md`
  - `.codex/agents/code-reviewer.toml`
  - `.codex/agents/scalability-reviewer.toml`
- These do not overlap with planned UX implementation files.

