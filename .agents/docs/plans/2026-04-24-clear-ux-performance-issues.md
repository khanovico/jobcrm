# Clear UX And Performance Issues

## Goal
Clear every issue in `.agents/docs/UX_PERFORMANCE_AUDIT_2026-04-24.md` through small, tested, reviewable tickets. Check the audit row only after code, tests, and integration review for that ticket are complete.

## Scope
- Frontend UX fixes in `app/src`.
- Backend/API performance fixes in `crm/app`.
- Tests in `app/src/**/*.test.tsx` and `crm/tests`.
- Audit tracking in `.agents/docs/UX_PERFORMANCE_AUDIT_2026-04-24.md`.

## Batch 1 Tickets
- UXPERF-023: Login production defaults and busy state.
- UXPERF-024: Admin-only route denial UX.
- UXPERF-053: Persisted theme toggle UX.
- UXPERF-055: Not found route.
- UXPERF-017: Bulk notification mark-read endpoint and UI call.
- UXPERF-049: Confirm worker release actions.
- UXPERF-050: API key one-time copy acknowledgement.
- UXPERF-005: Bound human list endpoint limits.
- UXPERF-006: Dashboard aggregate counts.

## Batch 2 Tickets
- UXPERF-038: Company list "Applied" column/filter wording.
- UXPERF-045: Profile education year validation.
- UXPERF-047: Notification message expansion/detail.
- UXPERF-048: Confirm destructive bulk notification delete.

## Relevant Files
- `app/src/App.tsx`
- `app/src/pages/LoginPage.tsx`
- `app/src/components/Layout.tsx`
- `app/src/pages/NotificationsPage.tsx`
- `app/src/pages/SettingsPage.tsx`
- `app/src/api.ts`
- `app/src/types.ts`
- `crm/app/main.py`
- `crm/app/repository.py`
- `crm/app/models.py`
- `crm/tests/test_api.py`
- `.agents/docs/UX_PERFORMANCE_AUDIT_2026-04-24.md`

## Parallel Work
- Worker A owns auth/routing/theme UX: `App.tsx`, `LoginPage.tsx`, `Layout.tsx`, related tests.
- Worker B owns notifications bulk mark-read: backend notification endpoint/repository, frontend notifications API/page, related tests.
- Worker C owns settings safety UX: `SettingsPage.tsx`, related tests.
- Main agent owns backend list-limit/dashboard aggregate work to avoid API/repository conflict drift.
- Worker D owns profile education validation: `ProfileDetailPage.tsx`, related tests.
- Worker E owns company-list wording: `CompaniesPage.tsx`, related tests.
- Main agent owns notifications detail/delete confirmation: `NotificationsPage.tsx`, `NotificationsPage.test.tsx`.

## Dependencies And Conflict Risks
- Worker A may touch `Layout.tsx`; no other batch work should edit it.
- Worker B may touch `crm/app/main.py` and `crm/app/repository.py`; main agent must coordinate backend edits before integration.
- Worker C should avoid shared components unless strictly necessary.
- Audit doc checkbox updates stay in main agent only.

## TODO
- [x] Confirm branch and load audit.
- [x] Use code-review-graph before file exploration.
- [x] Spawn Worker A for auth/routing/theme UX.
- [ ] Spawn Worker B for notifications bulk mark-read.
- [x] Spawn Worker C for settings safety UX.
- [x] Implement UXPERF-005 and UXPERF-006 locally.
- [x] Integrate worker reports and changed files.
- [x] Run targeted backend tests.
- [x] Run targeted frontend tests.
- [x] Run `cd app && npm run build`.
- [x] Run review and scalability review on integrated batch.
- [x] Check completed audit rows.
- [x] Commit batch 1.
- [x] Spawn Worker D for UXPERF-045.
- [x] Spawn Worker E for UXPERF-038.
- [x] Implement UXPERF-047 and UXPERF-048 locally.
- [x] Run batch 2 targeted tests/build.
- [x] Run review and scalability review on batch 2.
- [x] Check completed audit rows for batch 2.
- [x] Commit batch 2.
