# Backend env file paths for local scripts

## Lesson
- Backend settings that rely on `.env` should resolve it from the backend package/root (`crm/.env`), not the shell's current working directory.

## Why
- Local scripts like `crm/scripts/create_account.py` may be launched from the repo root, from `crm/`, or by tooling. Relative `env_file=".env"` can silently fall back to defaults like Docker hostnames and look like a DB connectivity bug.

## Reuse
- For backend config, prefer absolute paths derived from `__file__` when the project expects a fixed env file location.
