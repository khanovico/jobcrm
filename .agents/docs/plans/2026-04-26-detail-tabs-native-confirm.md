# Detail tabs and native confirm cleanup

## Goal and scope

- Make detail-page section tabs render as horizontal tabs instead of vertically stacked buttons.
- Replace remaining `window.confirm` usage in application create/edit modal with the shared in-app modal.
- Keep scope to frontend UI/components and focused tests.

## Relevant files

- `app/src/pages/CompanyDetailPage.tsx` - Review / Applications / Edit tab controls.
- `app/src/pages/ProfileDetailPage.tsx` - Basics / Education / Writing tab controls.
- `app/src/components/NewApplicationModal.tsx` - dirty-close confirmation currently uses native `window.confirm`.
- `app/src/components/NewApplicationModal.test.tsx` - confirmation behavior tests.
- Existing modal component: `app/src/components/Modal.tsx`.

## Task groups

1. Tabs
   - Convert detail section controls from `btn` styling inside `tabs` to real daisyUI `tab` styling.
   - Add/keep ARIA tab semantics where appropriate.
   - Ensure horizontal overflow instead of wrapping into a vertical stack.
   - Verify with existing company/profile tests plus targeted assertions if needed.

2. Native confirm
   - Add in-app dirty discard modal in `NewApplicationModal`.
   - Preserve cancel/close/backdrop behavior, including reopening dialog after canceled close.
   - Update tests to assert custom modal and no native `window.confirm`.

3. Validation
   - Run targeted Vitest tests for changed files.
   - Run `cd app && npm run build`.
   - Review frontend scale/performance risk: no added fetches, only local state/UI.

## TODO

- [x] Patch tab class helpers and tab containers.
- [x] Patch `NewApplicationModal` dirty confirm flow.
- [x] Update tests for custom discard modal.
- [x] Run targeted frontend tests.
- [x] Run frontend build.
- [ ] Commit focused changes.

## Parallel-safe work

- No subagent split planned; files are small and overlapping test/component changes are easier integrated in one pass.

## Risks

- `<dialog>` close events can double-fire if the dirty discard modal and parent modal interact incorrectly.
- Tests may need to account for nested dialogs.
