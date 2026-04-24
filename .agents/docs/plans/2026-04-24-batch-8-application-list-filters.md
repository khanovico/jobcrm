# Batch 8: Server-Backed Application List Filters

## Goal And Scope

Clear:

- `UXPERF-010`: application list must not page through every profile summary for filter options.
- `UXPERF-011`: company and applied-profile filters must query the full server result set, not only the current page.
- `UXPERF-012`: applied-profile filter choices should come from application result facets, not every profile in the catalog.
- `UXPERF-030`: company filter must be a server query, not a current-page-only filter.
- `UXPERF-031`: mark-applied should keep the current list mode stable instead of jumping tabs.

Out of scope:

- Full pagination metadata and result totals (`UXPERF-022/027`).
- Worker-state request gating (`UXPERF-013`).
- General async action error-state work (`UXPERF-032`).

## Approach

- Keep `GET /api/v1/applications` backward-compatible as a list response, but add query params for `company_search` and repeated `applied_profile_names`.
- Add a small application applied-profile facets endpoint that uses the same base list filters and returns only names present in matching application rows.
- Remove `listAllProfileSummaries()` usage from `ApplicationsPage`.
- Make company filter and applied-profile filter reset page to 1 and reload from the API.
- Keep mark/unmark applied on the current mode; reload the current page after the mutation.

## Relevant Files

- `crm/app/models.py`
- `crm/app/main.py`
- `crm/app/repository.py`
- `crm/tests/test_api.py`
- `app/src/types.ts`
- `app/src/api.ts`
- `app/src/pages/ApplicationsPage.tsx`
- `app/src/pages/ApplicationsPage.test.tsx`
- `.agents/docs/UX_PERFORMANCE_AUDIT_2026-04-24.md`

## TODO

- [x] Add backend query/filter/facet support with targeted tests.
- [x] Update frontend API types and Applications page state flow.
- [x] Update frontend tests for server-backed filters and stable mark-applied mode.
- [x] Run targeted backend and frontend tests plus frontend build.
- [x] Run code review and scalability review.
- [ ] Mark audit rows checked, commit, merge to `codex/ux-performance-audit`, and re-run final verification.

## Parallel Work

- Backend support can be implemented separately from frontend rendering if file ownership stays under `crm/`.
- Frontend can update `app/src` against the intended API contract while backend work lands.

## Success Criteria

- Opening/paging/sorting Applications no longer calls `/api/v1/profiles/summary`.
- Company search sends `company_search` to `/api/v1/applications` and resets to page 1.
- Applied-profile filter choices are returned by the application facets endpoint.
- Selecting/unselecting profile filters sends repeated `applied_profile_names` params to the list API.
- Mark Applied/Unmark Applied does not switch Pending/Applied tabs automatically.
