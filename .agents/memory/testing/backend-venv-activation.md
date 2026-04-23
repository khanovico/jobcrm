# Backend Venv Activation

## User preference (2026-04-23)
- For backend commands and any backend-related logic, always activate the project virtualenv first:

```bash
source crm/.venv/bin/activate
```

## Usage
- Apply before running backend tests, scripts, local servers, migrations, or package/version checks tied to `crm/`.
- Prefer this activation pattern over calling binaries directly from `crm/.venv/bin/...` unless a task specifically requires an explicit path.
