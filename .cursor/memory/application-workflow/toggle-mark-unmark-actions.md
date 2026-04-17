# Toggle Mark/Unmark Actions Across Application Flows

## Problem
- UI actions for application tracking were one-way ("Mark ..."), even when already marked.
- Per-profile email route accepted only mark-sent behavior from frontend, so users could not unmark.

## Fix
- Standardized frontend actions to toggle based on current state:
  - Applications table: `Mark Applied` ↔ `Unmark Applied`
  - Application detail: `Mark applied` ↔ `Unmark applied`
  - Application detail tracker: `Mark email sent` ↔ `Unmark email sent`
  - Per-profile email rows: `Mark email sent` ↔ `Unmark email sent`
- Added distinct styling for marked state action (outline button) to visually differentiate unmark from mark actions.
- Updated backend `/api/v1/emails/{email_id}/mark-sent` to accept payload `{ "sent": bool }`.
- Updated frontend API client `markEmailSent(emailId, sent)` to pass boolean payload.

## Why
- Users need reversible actions for incorrect or changed tracking states.
- Visual distinction reduces accidental repeated marking and clarifies current state.

## When to reuse
- Any UI action backed by a boolean state should render as a stateful toggle (label + style + payload) rather than only a one-way "mark" action.
