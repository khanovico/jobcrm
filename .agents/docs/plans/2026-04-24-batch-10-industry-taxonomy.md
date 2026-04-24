# Batch 10: Industry Taxonomy Pagination And Picker

## Goal And Scope

Clear:

- `UXPERF-014`: Company detail loads the full industry catalog and renders unbounded picker options.
- `UXPERF-015`: Industries page is capped at 200 rows and lacks pagination/count clarity.
- `UXPERF-046`: Industry management and company picker use inconsistent taxonomy access patterns.

## Approach

- Add backend support for bounded industry counts and selected-id hydration so the UI can show totals and keep selected company industries labeled without fetching the whole taxonomy.
- Update Industries page to use page-sized requests, server-backed search, total/visible range text, and pagination controls.
- Replace the unbounded IndustryMultiSelect dropdown with a searchable, bounded option picker that keeps selected industries hydrated.
- Keep destructive industry delete modal work out of this batch because it is tracked separately by `UXPERF-020`.

## Relevant Files

- `crm/app/models.py`
- `crm/app/main.py`
- `crm/app/repository.py`
- `crm/tests/test_api.py`
- `app/src/api.ts`
- `app/src/types.ts`
- `app/src/state/industryCatalog.ts`
- `app/src/components/IndustryMultiSelect.tsx`
- `app/src/pages/CompanyDetailPage.tsx`
- `app/src/pages/IndustriesPage.tsx`
- related frontend tests

## TODO

- [x] Add backend industry count and selected-id hydration support with tests.
- [x] Update Industries page to use real pagination, search state, and count/range display.
- [x] Update CompanyDetail industry loading to avoid full-catalog fetches.
- [x] Update IndustryMultiSelect to render bounded search results and selected labels only.
- [x] Add/adjust frontend regression tests for pagination, bounded picker search, and selected hydration.
- [x] Run targeted backend and frontend tests plus frontend build.
- [x] Run code-reviewer and scalability-reviewer and address actionable findings.
- [x] Update audit rows `UXPERF-014`, `UXPERF-015`, and `UXPERF-046`.
- [x] Commit Batch 10 and merge back into `codex/ux-performance-audit`.

## Parallel Work

- Backend worker owns only `crm/app/*` and `crm/tests/test_api.py`.
- Main agent owns frontend files and docs.
- Merge risk is low as long as backend API shapes are documented before frontend wiring.

## Success Criteria

- Company detail does not call a fetch-all industry catalog path on load.
- Industry picker requests a small bounded result set per search and preserves labels for already selected industries.
- Industries page can move past the first page and displays result range/total for the current search.
- All changed flows have targeted tests and the app build passes.
