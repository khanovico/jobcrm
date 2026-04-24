# Pagination UI refresh + applications page size update (2026-04-23)

## Goal and scope
- Update Applications table pagination size from 20 to 15 items per page.
- Replace current table pagination footer pattern (`Page X` + separate Previous/Next) with a cleaner best-practice pagination component across all table views.
- Keep behavior unchanged aside from visual/UX pagination controls and applications page-size.

## Relevant files
- `app/src/pages/ApplicationsPage.tsx`
- `app/src/pages/CompaniesPage.tsx`
- `app/src/pages/ProfilesPage.tsx`
- `app/src/pages/NotificationsPage.tsx`
- `app/src/pages/AuditPage.tsx`
- `app/src/pages/CompanyDetailPage.tsx`
- `app/src/pages/*.test.tsx` files asserting old pagination text/buttons
- new shared component: `app/src/components/TablePagination.tsx`

## Task groups
1. Build shared pagination component for table footers.
2. Integrate component into all table pages currently using old `Page X` + Previous/Next footer.
3. Update applications page size constant to 15.
4. Update/add frontend tests for new pagination labels/behavior and application list query limit.
5. Run targeted tests and required frontend build.

## TODO checklist
- [x] Create `TablePagination` component with accessible nav + compact numbered controls.
- [x] Wire component into Applications, Companies, Profiles, Notifications, Audit, Company Detail applications table.
- [x] Change Applications page `PAGE_SIZE` from 20 to 15.
- [x] Update tests that assert `Page X` or old controls.
- [x] Run targeted tests for changed pages.
- [x] Run `cd app && npm run build`.
- [ ] Capture screenshot(s) for UI confirmation.
- [x] Commit changes.
- [ ] Open PR via MCP tool.

## Parallel-safe work
- Test updates can be done after component/page integration; no parallelization needed to avoid conflicts.

## Dependencies / risks
- Many tests assert literal `Page 1`/`Page 2`; likely broad snapshot/assertion updates needed.
- Unknown total pages pattern requires progressive pagination (known previous pages + optional next).
