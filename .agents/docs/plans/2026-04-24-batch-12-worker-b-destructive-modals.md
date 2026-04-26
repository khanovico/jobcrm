# Batch 12 Worker B - Destructive Modal UX (Industries + Application Detail)

## Goal and scope
- Replace native browser confirm dialogs in owned flows with in-app modals.
- Keep changes limited to:
  - `app/src/pages/IndustriesPage.tsx`
  - `app/src/pages/IndustriesPage.test.tsx` (existing tests)
  - `app/src/pages/ApplicationDetailPage.tsx`
  - `app/src/pages/ApplicationDetailPage.test.tsx`
  - one small reusable modal component if needed.

## Relevant files and references
- `app/src/pages/IndustriesPage.tsx` (`removeIndustry` currently uses `window.confirm`)
- `app/src/pages/IndustriesPage.test.tsx` (delete path currently spies `window.confirm`)
- `app/src/pages/ApplicationDetailPage.tsx` (`removeEmail` currently uses `window.confirm`)
- `app/src/pages/ApplicationDetailPage.test.tsx` (email delete test spies `window.confirm`)
- Existing modal pattern references:
  - `app/src/components/Modal.tsx`
  - `app/src/components/ClearApplicationToPendingModal.tsx`

## Task groups
1. Add/reuse modal component for destructive confirmation with contextual body + disabled submitting controls.
2. Integrate industry delete flow with modal state + submit lifecycle.
3. Integrate application detail email delete flow with modal state + submit lifecycle.
4. Update focused tests for both flows.
5. Run targeted frontend tests (owned pages) and run build if needed.

## TODO checklist
- [x] Implement reusable destructive modal component (or equivalent inline modal state) for both flows.
- [x] Replace `window.confirm` in industries delete with contextual in-app modal.
- [x] Replace `window.confirm` in application-detail email delete with contextual in-app modal.
- [x] Ensure destructive buttons/modal actions disable while submitting.
- [x] Update industries page tests for modal confirmation flow.
- [x] Update application detail tests for modal confirmation flow.
- [x] Run targeted tests for changed pages.
- [x] Run frontend build if type confidence needs confirmation.
- [x] Commit scoped changes with codex-bot identity.

## Parallel-safe work
- Tests for industries and application detail can be updated independently after modal integration.

## Dependencies and merge/conflict risks
- Low/medium risk around concurrent edits in page files from other workers; keep edits localized near delete handlers and JSX action sections.
- Avoid touching unrelated dirty files:
  - `.agents/rules/memory-preservation.md`
  - `.codex/agents/code-reviewer.toml`
  - `.codex/agents/scalability-reviewer.toml`
