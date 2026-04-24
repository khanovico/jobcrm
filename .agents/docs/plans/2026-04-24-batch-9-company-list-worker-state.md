# Batch 9: Company List Payload, Worker Summary, And Freshness

## Goal And Scope

Clear support for:

- `UXPERF-013`: non-admin-readable worker summary endpoint.
- `UXPERF-018`: compact company list/search payload endpoint.
- `UXPERF-019`: fresher company list cache behavior after agent/other-tab changes.

Out of scope:

- Full denormalization of `has_application` / `application_count` onto company records.
- Replacing all production read paths that still load at process startup (`UXPERF-003`).

## Approach

- Add `CompanyListItem` response model with compact list-safe fields only.
- Add `/api/v1/companies/summary` with same filters/sort/pagination as `/api/v1/companies`.
- Add repository support in base/in-memory/mongo, with Mongo projection that excludes heavy research/enrichment fields.
- Add `/api/v1/workers/summary` for authenticated users, backed by `repo.get_worker_state()`.
- Keep `/api/v1/companies`, `/api/v1/settings/workers`, and worker mutation routes unchanged for compatibility/admin safety.
- Move Companies page, company summary cache, NewApplicationModal search, and Applications worker banner to compact/lightweight endpoints.
- Shorten company summary TTL, invalidate after app/company mutations, and force-refresh Companies on foreground return with duplicate event coalescing.

## Relevant Files

- `crm/app/models.py`
- `crm/app/main.py`
- `crm/app/repository.py`
- `crm/tests/test_api.py`
- `app/src/api.ts`
- `app/src/types.ts`
- `app/src/state/companySummaries.ts`
- `app/src/state/workerState.ts`
- `app/src/pages/CompaniesPage.tsx`
- `app/src/pages/ApplicationsPage.tsx`
- `app/src/components/NewApplicationModal.tsx`
- related frontend tests

## TODO

- [x] Add compact company summary model and repository methods.
- [x] Add company summary and worker summary API routes.
- [x] Add focused API/repository tests for auth, compact payload, filters/sort/pagination, and Mongo projection.
- [x] Move frontend company list/search flows to `/companies/summary`.
- [x] Move worker banners to cached `/workers/summary` and avoid admin route calls from list pages.
- [x] Shorten company summary cache TTL and refresh/invalidate stale list state.
- [x] Add frontend regression coverage for summary endpoint usage, worker route replacement, app-create cache invalidation, and foreground coalescing.
- [x] Run backend `crm/tests/test_api.py`.
- [x] Run targeted frontend tests and `npm run build`.
- [x] Run code-reviewer and scalability-reviewer, then address actionable findings.
- [x] Commit Batch 9 and merge back into `codex/ux-performance-audit`.

## Success Criteria

- `/api/v1/companies/summary` returns compact list rows only and respects existing company filters, sort, and pagination.
- Mongo company summary path reads projected fields only, not full research/enrichment blobs.
- `/api/v1/workers/summary` returns worker state for authenticated users.
- `/api/v1/settings/workers` remains admin-only for read/write routes.
- Companies and Applications list pages no longer call admin worker settings for read-only banners.
- Company list cache refreshes quickly after foreground return and app/company actions that change list summaries.
