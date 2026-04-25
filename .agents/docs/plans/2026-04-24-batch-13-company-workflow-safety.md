# Batch 13: Company Workflow Safety

## Goal And Scope

Clear:

- `UXPERF-039`: Archived-company restore is a hidden two-submit flow.
- `UXPERF-040`: Company detail mixes review and edit in one long page.
- `UXPERF-041`: Stored enrichment can be hidden from review while still editable.
- `UXPERF-042`: Clear-company research modal uses ambiguous destructive choices.
- `UXPERF-054`: Company detail action errors appear at the page top instead of near failed controls.

## Approach

- Keep this batch centered on company create/detail/reset flows.
- Replace the hidden archived-company second submit with an explicit restore modal showing archived company context.
- Restructure company detail into scan-friendly review/edit sections or tabs, keeping AI/generated fields out of accidental edit paths.
- Show stored-but-hidden enrichment as an explicit collapsed preview with a review/edit action when company status hides it.
- Rename clear-company destructive actions and lock modal submit controls while clearly stating whether related applications are archived or reset.
- Add contextual inline errors near company-detail actions while preserving global alerts for page-load failures.

## Relevant Files

- `app/src/pages/CompaniesPage.tsx`
- `app/src/pages/CompaniesPage.test.tsx`
- `app/src/pages/CompanyDetailPage.tsx`
- `app/src/pages/CompanyDetailPage.test.tsx`
- `app/src/components/ClearCompanyResearchModal.tsx`
- `app/src/components/ClearCompanyResearchModal.test.tsx`
- `crm/tests/test_api.py` only if a validation gap appears

## TODO

- [ ] Map existing CompaniesPage archived restore, CompanyDetailPage sections/actions, and clear-company modal tests.
- [ ] Replace archived-company restore second-submit with an explicit restore modal and tests.
- [ ] Restructure CompanyDetailPage review/edit flow and hidden enrichment preview.
- [x] Make clear-company destructive labels explicit and test modal copy/submit locking.
- [ ] Add contextual company-detail action errors and tests.
- [ ] Run targeted frontend tests and `npm run build`.
- [ ] Run code-reviewer and scalability-reviewer and address actionable findings.
- [ ] Update audit rows for cleared Batch 13 issues.
- [ ] Commit Batch 13 and merge back into `codex/ux-performance-audit`.

## Parallel Work

- Worker A owns `CompaniesPage` archived restore modal and tests.
- Worker B owns `ClearCompanyResearchModal` destructive copy/locking and tests.
- Main agent owns `CompanyDetailPage`, integration, validation, review, docs, and merge.

## Success Criteria

- Archived restore is an explicit modal decision with company context.
- Company detail first supports review; editing AI/generated fields is behind a deliberate edit mode/section.
- Hidden enrichment is visible as stored context instead of disappearing from review.
- Clear-company modal copy says exactly what will happen to related applications and generated artifacts.
- Failed company-detail actions show feedback near the action that failed.
