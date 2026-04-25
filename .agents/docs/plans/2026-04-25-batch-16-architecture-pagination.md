# Batch 16: Mongo Startup And Pagination Metadata

## Goal And Scope

Clear the final open audit rows:

- `UXPERF-003`: Production Mongo startup should not read every persisted collection into process memory for normal reads.
- `UXPERF-022`: Table pages should have total/has-next metadata instead of inferring navigation only from item count.

## Relevant Files

- `crm/app/models.py`
- `crm/app/repository.py`
- `crm/app/main.py`
- `crm/tests/test_api.py`
- `app/src/api.ts`
- `app/src/types.ts`
- `app/src/pages/ApplicationsPage.tsx`
- `app/src/pages/CompaniesPage.tsx`
- `app/src/pages/ProfilesPage.tsx`
- `app/src/pages/NotificationsPage.tsx`
- `app/src/pages/AuditPage.tsx`
- `app/src/pages/CompanyDetailPage.tsx`
- matching frontend tests

## TODO

- [x] Map remaining MongoRepository read paths that still depend on startup collection loading.
- [x] Add a no-full-load Mongo startup path with tests for startup behavior and critical read/write follow-up reads.
- [x] Add paged response models and backend count/page methods for Applications, Companies, Profiles, Notifications, Audit, and company-detail applications.
- [x] Update frontend pages to consume total/has-next metadata and pass `totalCount` into `TablePagination`.
- [x] Run focused backend and frontend tests.
- [x] Run full backend tests, full frontend tests, and frontend build.
- [x] Run reviewer and scalability review, then address findings.
- [x] Update UX audit rows.
- [ ] Merge Batch 16 back into `codex/ux-performance-audit`.

## Parallel Work

- Explorer can map Mongo startup dependencies while main implements pagination metadata.
- Avoid parallel writes to `crm/app/repository.py` and `crm/tests/test_api.py`; main owns those files.

## Risks

- Removing `_load()` too aggressively could break inherited write methods that still use in-memory dictionaries for mutation logic.
- Pagination response changes must preserve existing list endpoints or update all callers in one sweep.
