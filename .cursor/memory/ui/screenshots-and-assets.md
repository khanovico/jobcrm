# UI Screenshots And Review Assets

## User preference (persistent)

- **Do not commit screenshots** (or other review-only captures) to the repository.
- When the user asks for screenshots for validation, **show them in the chat** or attach ephemeral artifacts only (for example under `.tmp/`, which is gitignored).

## Cloud / remote mode (agent runs in Cursor cloud)

- After implementing **UI or visible behavior** the user asked to validate, **provide screenshots in the chat** so they can visually confirm (run the app or Playwright, save PNGs under `.tmp/` only, embed in the reply).
- This applies especially when the user requests fixes/features that need **visual verification**; do not rely on code-only handoff unless they opt out.

## When to reuse

- Any task that asks for "screenshots for validation" or demo images: generate locally, display to the user, **do not** add PNGs under `docs/` or similar tracked paths unless the user explicitly asks to version them.
