# Test Coverage Discipline

## User preference (2026-04-16, reinforced 2026-04-18)
- Every **new feature** or **feature update** must include explicit automated test coverage in the same workstream (not only manual checks or build-only).
- Do not ship UI-only behavior without at least targeted frontend tests when the change is user-visible logic (e.g. conditional rendering, status-driven labels).

## Reuse guidance
- Add targeted tests first for each new behavior path (happy path + important failure/edge path).
- Cover both backend and frontend when feature spans API + UI behavior.
- After targeted tests pass, run full backend and frontend suites before reporting completion.

## Example (2026-04-18)
- Company detail: read-only research summary visible only when `research_status === "indexed"` — covered by `app/src/pages/CompanyDetailPage.test.tsx`; API “clear” preserves fields — covered by `crm/tests/test_api.py`.
