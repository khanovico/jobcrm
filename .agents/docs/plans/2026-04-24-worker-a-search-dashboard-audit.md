# Worker A Plan - Search Contract + Dashboard Audit

## Goal and Scope

Implement the Worker A portion of Batch 15 on branch `codex/uxperf-batch-15-search-dashboard-audit`.

In scope:
- compact application summaries in the global search contract for dashboard use
- dashboard search UX improvements and recognizable application result rows
- targeted backend and frontend automated tests

Out of scope:
- `AuditPage` changes
- unrelated search entity shapes
- broad refactors outside owned files

## Relevant Files and References

- `crm/app/models.py`
- `crm/app/repository.py`
- `crm/app/main.py` only if search response wiring needs updates
- `crm/tests/test_api.py`
- `app/src/types.ts`
- `app/src/pages/DashboardPage.tsx`
- dashboard frontend tests only

## Task Groups

1. Inspect current global search application contract and dashboard rendering/testing.
2. Replace full application payload usage with compact application summaries.
3. Improve dashboard metric card actions, search loading state, empty state, and application row presentation.
4. Add focused backend and frontend tests.
5. Run targeted validation:
   - backend `pytest` for impacted API tests
   - frontend Vitest for dashboard tests
   - `cd app && npm run build`

## TODO Checklist

- [ ] Inspect current search schemas, repository shaping, dashboard data usage, and existing tests.
- [ ] Implement compact backend application search summary shape.
- [ ] Update dashboard types and rendering to consume summary rows only.
- [ ] Add busy and empty states plus actionable metric links/cards on dashboard.
- [ ] Add backend tests for compact application search summaries.
- [ ] Add frontend tests for dashboard search states and recognizable application rows.
- [ ] Run targeted backend/frontend validation and record results.

## Parallel-Safe Tasks

- Backend contract update and backend tests are coupled; keep together.
- Dashboard component and dashboard tests are coupled; keep together.
- No subagents planned because file ownership overlaps and concurrent workers are already active in the repo.

## Dependencies and Merge/Conflict Risks

- Search contract may already be touched by another worker; read carefully and preserve concurrent edits.
- Dashboard page may have nearby UX work from another worker; keep edits surgical and avoid unrelated cleanup.
- Shared frontend types may affect compile/test expectations; verify with targeted tests and build.
