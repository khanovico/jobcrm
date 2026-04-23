# Windows JobCRM API Rule (curl.exe)

Use `curl.exe` for all JobCRM API calls on Windows (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).

Do not use Python inline for routine API checks.

## Base

```powershell
curl.exe -i "$env:JOBCRM_API_ORIGIN/<path>" `
  -H "X-API-Key: $env:JOBCRM_X_API_KEY" `
  -H "Content-Type: application/json"
```

## Methods

### GET

```powershell
curl.exe -i "$env:JOBCRM_API_ORIGIN/api/v1/agent/health" `
  -H "X-API-Key: $env:JOBCRM_X_API_KEY"
```

### POST

```powershell
curl.exe -i -X POST "$env:JOBCRM_API_ORIGIN/api/v1/agent/notifications" `
  -H "X-API-Key: $env:JOBCRM_X_API_KEY" `
  -H "Content-Type: application/json" `
  --data "{\"user_id\":\"...\",\"notification\":\"SYSTEM_ERROR\",\"type\":\"WARN\",\"payload\":{\"message\":\"...\"}}"
```

### PUT

```powershell
curl.exe -i -X PUT "$env:JOBCRM_API_ORIGIN/api/v1/agent/applications/<id>" `
  -H "X-API-Key: $env:JOBCRM_X_API_KEY" `
  -H "Content-Type: application/json" `
  --data "{\"status\":\"ppa_analyzing\"}"
```

### PATCH

```powershell
curl.exe -i -X PATCH "$env:JOBCRM_API_ORIGIN/api/v1/agent/companies/bulk" `
  -H "X-API-Key: $env:JOBCRM_X_API_KEY" `
  -H "Content-Type: application/json" `
  --data "{\"updates\":[...]}"
```

### DELETE

```powershell
curl.exe -i -X DELETE "$env:JOBCRM_API_ORIGIN/api/v1/..." `
  -H "X-API-Key: $env:JOBCRM_X_API_KEY"
```

## Quick Rules

- Always use `-i` (show status + headers).
- Add `-X <METHOD>` for non-GET.
- Add `--data "<json>"` + `Content-Type: application/json` for body methods.
- Keep JSON compact and valid.
