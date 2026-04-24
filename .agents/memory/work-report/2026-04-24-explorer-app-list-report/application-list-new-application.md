# Application List + New Application Batch Plan

Date: 2026-04-24
Branch context:
- Integration: `codex/ux-performance-audit`
- Active branch during exploration: `codex/uxperf-batch-6-agent-detail-hotpaths`

Scope audited:
- UXPERF-010
- UXPERF-011
- UXPERF-012
- UXPERF-028
- UXPERF-029
- UXPERF-030
- UXPERF-031

Graph-first notes:
- `code-review-graph` available. Minimal context pointed at `app-application` community and `ApplicationsPage` hotpath.
- Useful graph result: `ApplicationsPage` is a 512-line function at `app/src/pages/ApplicationsPage.tsx:32`.
- Useful graph result: `NewApplicationModal` is a 234-line function at `app/src/components/NewApplicationModal.tsx:38`.

## Current hot paths

### Applications list
- `app/src/pages/ApplicationsPage.tsx:58`
  - `loadProfileNamesForFilter()`
  - Calls `api.listAllProfileSummaries()`.
- `app/src/pages/ApplicationsPage.tsx:104`
  - `companySearchFilteredItems`
  - Filters current page only.
- `app/src/pages/ApplicationsPage.tsx:112`
  - `filteredItems`
  - Applies selected profile names to current page only.
- `app/src/pages/ApplicationsPage.tsx:130`
  - `listParams`
  - Builds server query, but only for mode/sort.
- `app/src/pages/ApplicationsPage.tsx:145`
  - `load()`
  - Fetches paged applications plus worker state; refetches profile summaries after every load.
- `app/src/pages/ApplicationsPage.tsx:393`
  - `markApplied` action
  - Flips `listMode`, causing row jump.
- `app/src/api.ts:152`
  - `listAllProfileSummaries()`
  - Exhausts `/profiles/summary`.
- `crm/app/main.py:640`
  - `list_applications()`
  - No `company_search`, no applied-profile filter, no pagination metadata/facets.
- `crm/app/repository.py:871`
  - `InMemoryRepository.list_applications()`
  - Filters by status/company/applied/email only.
- `crm/app/repository.py:1835`
  - `MongoRepository.list_applications()`
  - Same contract, query-backed.

### New application
- `app/src/components/NewApplicationModal.tsx:90`
  - Auto-selects first fetched company when current id missing.
- `app/src/components/NewApplicationModal.tsx:100`
  - `loadCompanyOptions()`
  - Uses bounded company search, still existing-company only.
- `app/src/components/NewApplicationModal.tsx:164`
  - `onSubmit()`
  - Hard-requires `companyId`; create path uses `api.createApplication()`.
- `app/src/components/NewApplicationModal.tsx:198`
  - Empty state pushes user to Companies page.
- `app/src/api.ts:175`
  - `bootstrapApplication()` already exists.
- `crm/app/main.py:694`
  - `bootstrap_application()`
  - Existing server support for company-name-first flow.
- `crm/app/main.py:97`
  - `_resolve_company_create()`
  - Handles duplicate name and archived-company reuse conflicts.

## Efficient batching

### Batch A: server-backed application filters
Best grouped:
- UXPERF-010
- UXPERF-011
- UXPERF-012
- UXPERF-030

Reason:
- One contract change clears repeated full-profile fetch and page-local filtering together.
- One shared edit surface: `ApplicationsPage`, `api.ts`, `/api/v1/applications`, repository list methods, types/tests.

Expected file/function set:
- `app/src/pages/ApplicationsPage.tsx`
  - remove `loadProfileNamesForFilter()`
  - move `companySearch` and applied-profile filter into request params
  - reset page on filter changes
  - render server-provided filter/facet options
- `app/src/api.ts`
  - change `listApplications()` response shape or add dedicated filter-options request
  - stop using `listAllProfileSummaries()` here
- `app/src/types.ts`
  - add application list response/facet types
- `crm/app/main.py`
  - extend `list_applications()` query params
- `crm/app/repository.py`
  - update both `list_applications()` implementations
  - likely add applied-profile/company-name query support
- `crm/app/models.py`
  - add response model if API stops returning bare list
- `app/src/pages/ApplicationsPage.test.tsx`
- `crm/tests/test_api.py`

Suggested server direction:
- Prefer single `/api/v1/applications` response with `{ items, has_next, total?, applied_profile_facets? }`.
- Add `company_search` and `applied_profile_names[]` query params.
- Facets should match current server-filtered result set, not full profile catalog.

### Batch B: company-name-first new application flow
Best grouped:
- UXPERF-028
- UXPERF-029

Reason:
- Same modal, same submit path, same conflict-handling UX.
- Backend mostly ready already; likely frontend-heavy batch.

Expected file/function set:
- `app/src/components/NewApplicationModal.tsx`
  - split create vs edit behavior
  - create path should accept typed company name, optional website, optional job post
  - remove first-option auto-selection
  - require explicit existing-company selection only when user chooses existing-company route
  - show archived-company restore / duplicate-company handling inline
- `app/src/api.ts`
  - reuse `bootstrapApplication()`
  - reuse `ApiConflictError`
- `app/src/pages/ApplicationsPage.tsx`
  - likely no logic change beyond modal props/callbacks
- `app/src/pages/CompaniesPage.tsx:125`
  - existing archived-company-ack pattern worth copying, not necessarily editing
- `crm/tests/test_api.py`
  - existing backend coverage already present for archived-company reuse; only extend if UI needs new edge semantics

Suggested UX shape:
- Create mode starts with `company_name`.
- Existing-company search becomes optional helper, not required first step.
- Only set company after explicit click/select.
- Keep edit mode on current `companyId` + search/select pattern; do not force bootstrap semantics onto edit flow.

### Batch C: stable mark-applied behavior
Best grouped:
- UXPERF-031

Can fold into Batch A if one owner owns `ApplicationsPage`.
Do not parallelize with Batch A on separate branches unless necessary; same file/test block.

Expected file/function set:
- `app/src/pages/ApplicationsPage.tsx:393`
  - keep current mode stable after `markApplied`
  - reload current page or update row in place
  - only remove row when current filters actually exclude it
- `app/src/pages/ApplicationsPage.test.tsx`
  - replace current expectation that action switches tabs

## Conflict risks

Highest conflict risk:
- `app/src/pages/ApplicationsPage.tsx`
- `app/src/pages/ApplicationsPage.test.tsx`
- `app/src/api.ts`

Medium conflict risk:
- `crm/app/main.py`
- `crm/app/repository.py`
- `crm/tests/test_api.py`
- `app/src/types.ts`

Why:
- `ApplicationsPage` already carries UXPERF-013, 022, 032 adjacency.
- Filter-contract work and mark-applied UX both touch same load/action code.
- Any parallel pagination/worker-state/list-metadata work will collide here.

Lowest-risk split:
1. Batch B on `NewApplicationModal`.
2. Batch A + C together in one owner branch.

## Suggested test targets

Frontend:
- `app/src/pages/ApplicationsPage.test.tsx`
  - server query includes `company_search`
  - server query includes applied-profile params
  - filter changes reset page to 1
  - no `/profiles/summary` fetch on initial load or paging
  - profile filter options come from server facets, not full catalog
  - mark-applied keeps current tab stable
- Add/expand `app/src/components/NewApplicationModal.test.tsx` if created
  - typed company name submits `bootstrapApplication`
  - create mode does not auto-select first search result
  - archived-company conflict shows restore confirmation path
  - edit mode still updates existing application

Backend:
- `crm/tests/test_api.py`
  - `/api/v1/applications` supports `company_search`
  - `/api/v1/applications` supports applied-profile filtering
  - response includes bounded facet metadata if added
  - combined filters still preserve page bounds / sort behavior
  - `/api/v1/applications/bootstrap` archived-company reuse and duplicate conflicts remain intact
- `crm/tests/test_api.py` or repository query tests
  - Mongo query path remains query-backed and page-bounded after new filters

Smoke/verification:
- `cd app && npm run build`
- targeted Vitest for `ApplicationsPage` and modal
- targeted pytest for application list / bootstrap routes

## Implementation order
1. Batch B first if goal is quick UX win with low backend churn.
2. Batch A next as shared API/frontend contract work.
3. Fold Batch C into Batch A before finishing, since tests and page state are already open.

## Notes for assignee
- Existing `bootstrapApplication()` and backend route make UXPERF-028 materially easier than audit text suggests.
- Avoid adding a separate profile-catalog fetch fix without also fixing UXPERF-011/012/030; partial fix likely leaves misleading filter UX.
- Existing `ApplicationsPage` test `"switches to Applied tab after marking an application as applied"` at `app/src/pages/ApplicationsPage.test.tsx:351` must change for UXPERF-031.
