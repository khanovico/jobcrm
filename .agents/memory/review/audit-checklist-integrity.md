# Audit Checklist Integrity

## Lesson
- When changing `[ ]` to `[x]` in audit docs, update both evidence and acceptance scope in the same change.

## Why
- Checkbox-only updates create false confidence and hide remaining risk.
- Stale evidence references often point to pre-fix code paths and confuse follow-up audits.

## Review Rule
- Treat checklist status as part of product behavior:
  - Verify code path exists and tests cover the claimed fix.
  - Verify the checklist language matches what shipped (full fix vs partial).
  - If partial, keep unchecked or explicitly annotate partial in row text.
