# Role-based access and account bootstrap

## Problem
- Public signup endpoints were exposed, and all authenticated users could reach settings/audit APIs and mutate profiles.

## Fix
- Removed public signup routes (`/api/v1/auth/register`, `/api/v1/auth/registration-status`).
- Added explicit user `role` (`admin` or `user`) with backward-compatible `admin` flag in API responses.
- Enforced RBAC: only `admin` can access settings and audit APIs and profile write operations; `user` keeps profile read access.
- Added CLI script `crm/scripts/create_account.py` to create accounts directly in DB with `--username`, `--password`, `--role admin|user`.

## Why
- Restricts privileged operations without blocking day-to-day user workflows.
- Keeps account creation controlled now that signup is hidden.

## When to reuse
- Any time auth policy removes self-registration or introduces tighter admin-only boundaries.
