# Batch 7: Company-Name-First New Application Flow

## Goal And Scope

Clear:

- `UXPERF-028`: new application creation should not require pre-creating a company on another page.
- `UXPERF-029`: company search must not auto-select the first fetched option.

Out of scope:

- Application list server-side filtering (`UXPERF-010/011/012/030`) and mark-applied row stability (`UXPERF-031`).
- Shared modal dirty-close guard (`UXPERF-025`), even though this modal will benefit later.

## Relevant Files

- `app/src/components/NewApplicationModal.tsx`
  - Use `api.bootstrapApplication()` for create mode.
  - Accept typed company name and optional website/job post.
  - Keep existing-company search as an explicit selectable helper.
  - Preserve edit mode behavior without first-result auto-selection.
  - Handle duplicate/archived company conflicts inline.
- `app/src/api.ts`
  - Existing `bootstrapApplication()` and `ApiConflictError` support.
- `app/src/pages/ApplicationsPage.test.tsx` or a new modal test
  - Cover typed company creation, explicit existing-company selection, no auto-select, and archived restore path.
- `crm/tests/test_api.py`
  - Existing bootstrap duplicate/archived coverage is already present; extend only if a missing backend edge appears.
- `.agents/docs/UX_PERFORMANCE_AUDIT_2026-04-24.md`
  - Mark rows only after tests/review pass.

## TODO

- [x] Refactor create-mode company state to typed name plus optional selected existing company.
- [x] Remove auto-select-first-option behavior for search results.
- [x] Add inline conflict UI for duplicate and archived company responses.
- [x] Add focused frontend tests.
- [x] Run targeted frontend tests and `npm run build`.
- [x] Run review and scalability review.
- [x] Commit, merge to `codex/ux-performance-audit`, update audit rows, and run final relevant verification.

## Conflict Risks

- Low to medium: primary code is isolated to `NewApplicationModal.tsx`.
- Medium: tests may touch `ApplicationsPage.test.tsx`, which upcoming application-list batches will also edit.

## Success Criteria

- User can create an application from a company name, optional website, and optional job post in one modal.
- Search results never change selected company unless the user clicks/selects one.
- Duplicate existing-company conflict gives an understandable inline path.
- Archived-company conflict shows the archived details and requires explicit restore.
