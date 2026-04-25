# Worker B Plan - Audit Investigation UX (Batch 15)

## Goal and Scope

Clear `UXPERF-051` for the audit investigation experience on branch `codex/uxperf-batch-15-search-dashboard-audit`.

In scope:
- `app/src/pages/AuditPage.tsx`
- `app/src/pages/AuditPage.test.tsx`
- `app/src/types.ts` only if needed for display typing
- `app/src/api.ts` only if needed for query support

Out of scope:
- dashboard changes
- backend search/API changes
- unrelated refactors

## Relevant File References

- `crm/app/main.py` (`/api/v1/audit-events` query params)
- `crm/app/models.py` (`AuditListQuery`)
- `crm/app/repository.py` (`list_audit_events` filter behavior)
- `app/src/pages/AuditPage.tsx`
- `app/src/pages/AuditPage.test.tsx`

## Ordered Task Groups

1. Add investigation filters for supported API params:
   - actor type
   - action
   - entity type
   - date range (`from_ts`, `to_ts`)
2. Improve row investigation affordances:
   - entity links for `company`, `application`, `profile`, `notification`
   - full actor/entity ID copy buttons
   - inline metadata expansion
3. Add focused frontend tests for new behavior paths.
4. Run targeted `AuditPage` tests and capture results.

## TODO Checklist

- [x] Update `AuditPage` state/query construction for new filters.
- [x] Render entity links where route mapping exists.
- [x] Add actor/entity full-ID copy buttons.
- [x] Add inline metadata show/hide per row.
- [x] Add/adjust `AuditPage` tests for filters, links/copy, metadata expansion.
- [x] Run targeted frontend test command for `AuditPage`.

## Validation

- `npx vitest run --pool=forks --minWorkers=1 --maxWorkers=1 src/pages/AuditPage.test.tsx` passed in the worker handoff.
- Batch integration reran the full frontend Vitest suite and production build successfully.

## Parallel-Safe Tasks

- Component and its test file are tightly coupled and should remain in one worker stream.

## Dependencies and Merge Risks

- Nearby type/api changes from other workers may land concurrently; avoid broad edits and keep `AuditPage` self-contained.
- Preserve existing pagination behavior and avoid touching `DashboardPage` or backend code.
