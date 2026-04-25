# Batch 12: Profile UX Safety

## Goal And Scope

Clear:

- `UXPERF-020`: Replace native destructive confirms with app modals and contextual impact.
- `UXPERF-021`: Improve profile save feedback and protect dirty long-form edits.
- `UXPERF-043`: Add profile list search/filter.
- `UXPERF-044`: Make profile create/edit less risky and less monolithic.

## Approach

- Keep this batch centered on profile workflows, with destructive-action modal work split into isolated files where possible.
- Add server-backed profile search and active/frozen filtering so large profile sets are findable without manual paging.
- Refactor profile detail into clearer sections/tabs, keep users on the detail page after save, and show inline saved/error state.
- Add dirty-navigation protection for accidental route changes and browser unloads from edited profile forms.
- Replace profile and industry destructive native confirms with app modals that explain impact and lock while submitting.
- If email-delete modal work can be completed without conflicting with the application detail changes, include it under the destructive-action ticket; otherwise keep the doc row open for that subpart.

## Relevant Files

- `app/src/pages/ProfilesPage.tsx`
- `app/src/pages/ProfileDetailPage.tsx`
- `app/src/pages/IndustriesPage.tsx`
- `app/src/pages/ApplicationDetailPage.tsx`
- `app/src/components/*Modal.tsx`
- `app/src/pages/*test.tsx`
- `crm/app/main.py`
- `crm/app/repository.py`
- `crm/tests/test_api.py`

## TODO

- [x] Map profile list/detail, destructive confirm, and profile summary API flows. _(Worker A scope)_
- [x] Add server-backed profile search and active/frozen filters. _(Worker A scope)_
- [x] Add profile list tests and backend tests for search/filter query behavior. _(Worker A scope)_
- [x] Replace native destructive confirms with app modal flows and tests.
- [x] Improve profile detail sections, save-in-place feedback, and dirty navigation guard.
- [x] Add/update targeted frontend tests for every cleared issue.
- [ ] Run targeted frontend/backend tests and `npm run build`.
- [ ] Run code-reviewer and scalability-reviewer and address actionable findings.
- [ ] Update audit rows for cleared Batch 12 issues.
- [ ] Commit Batch 12 and merge back into `codex/ux-performance-audit`.

## Parallel Work

- Worker A owns profile list search/filter API and UI.
- Worker B owns destructive modal replacement outside `ProfileDetailPage`.
- Main agent owns `ProfileDetailPage`, integration, tests, docs, review, merge.

## Success Criteria

- Users can search/filter profiles by meaningful fields without loading every profile.
- Profile saves confirm success in context and do not kick users away from long-form edits.
- Dirty profile edits are protected from accidental close/navigation.
- Destructive actions use consistent modal UX with impact copy and submit locking.
- The batch has targeted frontend/backend coverage, build coverage, review coverage, and audit checkboxes updated only after fixes land.
