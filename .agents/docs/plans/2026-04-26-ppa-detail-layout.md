# PPA detail layout improvement

## Goal and scope

- Improve the per-profile application detail area on application detail pages.
- Remove the equal-height two-column layout where a short Recipient panel sits beside a much larger Outreach plan.
- Give subject options more horizontal room and a more scannable layout.

## Relevant files

- `app/src/pages/ApplicationDetailPage.tsx` - PPA detail markup for recipient and outreach plan.
- `app/src/pages/ApplicationDetailPage.test.tsx` - targeted UI assertions for PPA detail rendering.

## Task groups

1. Layout
   - Move Recipient into a compact full-width strip above Outreach plan.
   - Make Outreach plan full width.
   - Render subject options as a responsive grid with natural wrapping.

2. Tests
   - Add/adjust targeted assertions for the new section order.
   - Preserve recipient edit/update behavior tests.

3. Validation
   - Run targeted `ApplicationDetailPage` tests.
   - Run frontend build.

## TODO

- [x] Patch PPA markup.
- [x] Update targeted tests.
- [x] Run targeted tests.
- [x] Run frontend build.
- [ ] Commit focused changes.

## Performance review

- No network/API changes.
- DOM count stays the same; layout changes only.
- Responsive grid should improve scan cost for 10+ subjects without additional rendering work.

## Risks

- Recipient edit form must keep labels and update payload unchanged.
- Subject selection state must remain visually clear after changing from badges to button-like options.
