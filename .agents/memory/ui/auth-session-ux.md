# Auth Session UX

## Problem
- UI surfaced raw FastAPI error payloads (for example `{"detail":"Missing token"}`), and auth headers could be missing when API auth state relied on in-memory token copies.

## Fix pattern
- Use `localStorage` as the stable token source in request wrappers to avoid stale in-memory auth state after reload/remount/HMR.
- Parse API error JSON and map `401` to a friendly message (`Session expired. Please sign in again.`).
- Register a global unauthorized handler that clears auth state and triggers redirect via existing route guards.

## Reuse when
- Any frontend auth flow where users report intermittent `Missing token` despite active sessions, or where backend error payloads leak directly into the UI.
