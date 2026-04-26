# Batch 11: Application Detail Workflow

## Goal And Scope

Clear:

- `UXPERF-032`: Inline application and email actions need busy/error state.
- `UXPERF-033`: Application detail needs a scan-first review summary and collapsed long bodies.
- `UXPERF-034`: Ambiguous "Clear" reset action needs explicit destructive wording.
- `UXPERF-035`: Application email-sent state must not silently diverge from email rows.
- `UXPERF-036`: Subject selection must appear at PPA scope, not inside each email card.
- `UXPERF-037`: Recipient editing must appear at PPA scope, not inside each email card.

## Approach

- Keep the batch centered on `ApplicationDetailPage` and its modal/tests to minimize merge risk.
- Add local action state for application marks, application email-sent, per-email sent, email delete, subject update, and recipient update.
- Add contextual inline errors near the affected action group while preserving the page-load alert.
- Add a compact review summary before PPA details: readiness, recommended profile(s), tailored resume link, active subject/recipient, sent consistency, and next action.
- Move PPA-shared subject and recipient controls into the PPA header area.
- Collapse long PPA analysis and email bodies by default, with stable controls to expand when needed.
- Rename reset actions to explicit "Reset preparation" wording and make the modal submit copy match the destructive operation.
- Treat application-level email-sent as a tracker only when at least one generated email is sent; show a warning and require choosing/marking a specific email when none are sent.

## Relevant Files

- `app/src/pages/ApplicationDetailPage.tsx`
- `app/src/pages/ApplicationDetailPage.test.tsx`
- `app/src/components/ClearApplicationToPendingModal.tsx`
- optional: `app/src/components/ClearApplicationToPendingModal.test.tsx`
- optional: `app/src/api.ts` / `app/src/types.ts` only if the implementation needs API shape changes

## TODO

- [x] Map current ApplicationDetail tests and identify assertions to update.
- [x] Add action busy/error state for app-level and email-level actions.
- [x] Add email-sent consistency handling and warning/disabled flow.
- [x] Add scan-first review summary and collapse long analysis/email bodies.
- [x] Move subject selector and recipient editor to PPA scope.
- [x] Rename/reset destructive UI copy and modal action.
- [x] Add/update targeted frontend tests for every cleared issue.
- [x] Run targeted frontend tests and `npm run build`.
- [x] Run code-reviewer and scalability-reviewer and address actionable findings.
- [x] Update audit rows `UXPERF-032` through `UXPERF-037`.
- [x] Commit Batch 11 and merge back into `codex/ux-performance-audit`.

## Parallel Work

- Explorer performs read-only mapping of `ApplicationDetailPage` and related tests.
- Main agent owns implementation in the page, modal, tests, and docs.
- Review agents run after implementation and validation.

## Success Criteria

- Repeated clicks are disabled while inline mutations are in flight.
- Failed inline actions show context near the failed control and roll back optimistic updates.
- Users can scan primary readiness and next action without reading every PPA/email body.
- Subject and recipient controls visually match their true PPA-level scope.
- Application email-sent tracking cannot create an unexplained contradiction with all email rows.
- Reset preparation wording clearly states that generated prep artifacts will be deleted.
