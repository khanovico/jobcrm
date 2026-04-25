# Batch 14: Shared UX Controls

## Goal And Scope

Clear:

- `UXPERF-025`: Shared modal close paths can discard edited form state without warning.
- `UXPERF-026`: Clickable table rows are mouse-only and lack primary links.
- `UXPERF-027`: Pagination lacks result range and stronger navigation affordances.

## Approach

- Add dirty-close protection to the application create/edit modal, covering close button, Esc/backdrop, and Cancel through the existing modal close path.
- Replace row-level click navigation in the company and application lists with primary cell links so keyboard and assistive-tech users have normal link affordances.
- Improve shared table pagination with first/previous/current/next affordances plus visible result-range copy where callers know page size and visible item count.
- Use sentinel page fetches on count-less lists so exact page-size boundaries do not expose phantom empty next pages; use total-aware last-page navigation where counts already exist.

## Relevant Files

- `app/src/components/NewApplicationModal.tsx`
- `app/src/components/NewApplicationModal.test.tsx`
- `app/src/components/TablePagination.tsx`
- `app/src/pages/CompaniesPage.tsx`
- `app/src/pages/CompaniesPage.test.tsx`
- `app/src/pages/ApplicationsPage.tsx`
- `app/src/pages/ApplicationsPage.test.tsx`
- `app/src/pages/CompanyDetailPage.tsx`
- `app/src/pages/AuditPage.tsx`
- `app/src/pages/IndustriesPage.tsx`
- `app/src/pages/NotificationsPage.tsx`
- `app/src/state/companySummaries.ts`
- other `TablePagination` callsites as needed

## TODO

- [x] Map current modal close, row navigation, and pagination callsites/tests.
- [x] Add NewApplicationModal dirty-close guard and tests.
- [x] Replace mouse-only row navigation with primary links and tests.
- [x] Add pagination range/first-page/last-page affordances and update callsites/tests.
- [x] Address reviewer findings: search-only dirty prompt, phantom next pages, narrow pagination overflow, and direct pagination tests.
- [x] Run targeted frontend tests and `npm run build`.
- [x] Run reviewers and address actionable findings.
- [x] Update audit rows for cleared Batch 14 issues.
- [x] Commit Batch 14 and merge back into `codex/ux-performance-audit`.

## Parallel Work

- Worker A owns `NewApplicationModal` dirty-close behavior and tests.
- Main agent owns row navigation, pagination integration, validation, review, docs, and merge.

## Success Criteria

- Dirty create/edit application modal state is not discarded by accidental close without an explicit confirmation.
- Company and application primary cells contain real links, and row-level click is no longer the only navigation path.
- Pagination gives users a clear current range and fast path back to the first page without needing totals; total-aware lists also expose a last-page control.
- Count-less lists fetch one sentinel row so exact page-size boundaries do not send users to an empty phantom page.
