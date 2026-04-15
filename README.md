# JobCRM Milestone 1

Milestone 1 delivers the core CRM foundation for JobCRM:

- JWT authentication
- CRUD APIs for companies, profiles, and applications
- application status transitions with validation
- mark-applied action with `applied_at` timestamp stamping
- React UI with dashboard, navigation shell, and entity management screens

## Tech Stack

- Frontend: React + TypeScript + Vite + Tailwind + daisyUI
- Backend: FastAPI + Pydantic + JWT + MongoDB
- Local orchestration: Docker Compose

## Environment files

Copy examples if you do not already have local env files:

- `cp crm/.env.example crm/.env`
- `cp app/.env.example app/.env`

For **local backend** talking to **Mongo in Docker** on the default port, set in `crm/.env`:

- `MONGO_URI=mongodb://127.0.0.1:27017`

For **frontend** calling a **local** API:

- `app/.env` → `VITE_API_URL=http://localhost:8000`

The API enables **CORS** for browser requests from the Vite dev server. Override allowed origins in `crm/.env` with `CORS_ORIGINS` (comma-separated) if you use another host or port.

## Run modes

### 1) Mongo, backend, and frontend (all via Docker)

From the repo root:

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- MongoDB: `localhost:27017` (mapped from the container)

Images copy your source at **build** time. After you change Python or TypeScript, run **`docker compose up --build`** again (or `docker compose build` then `up`) so the image includes the new files.

### 2) Mongo only (Docker) + backend and frontend on your machine

Use this when you want hot reload and faster iteration without rebuilding images.

**Terminal 1 — Mongo**

```bash
docker compose up mongo
```

Or in the background: `docker compose up -d mongo`

**Terminal 2 — Backend**

```bash
python3 -m venv crm/.venv
source crm/.venv/bin/activate
pip install -r crm/requirements.txt
cd crm
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Ensure `crm/.env` has `MONGO_URI=mongodb://127.0.0.1:27017` (and matching `MONGO_DB_NAME`).

**Terminal 3 — Frontend**

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173` (Vite prints the exact URL).

### 3) Backend Python environment (one-time)

```bash
python3 -m venv crm/.venv
source crm/.venv/bin/activate
pip install -r crm/requirements.txt
```

## API Highlights

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET/POST/PUT/DELETE /api/v1/companies`
- `GET/POST/PUT/DELETE /api/v1/profiles`
- `GET/POST/PUT/DELETE /api/v1/industries`
- `GET/POST/PUT/DELETE /api/v1/applications`
- `POST /api/v1/applications/bootstrap` (company name + optional job post → `pending_preparation`)
- `POST /api/v1/applications/{id}/mark-applied`
- `POST /api/v1/applications/{id}/mark-email-sent`
- `GET /api/v1/search`, `GET /api/v1/metrics/dashboard`
- `GET /api/v1/notifications`, `POST /api/v1/notifications/{id}/read`
- `GET /api/v1/audit-events`
- Per-profile + emails: `/api/v1/applications/{id}/per-profile-applications`, `/api/v1/per-profile-applications/{id}/emails`, `POST /api/v1/emails/{id}/mark-sent`
- JAA (API key header `X-API-Key`): `/api/v1/agent/applications/pending`, `/api/v1/agent/...` (read + scoped write)
- `POST /api/v1/admin/agent-keys` (admin JWT) — returns one-time `raw_key`
- Static: `GET /llm.txt`, `GET /sitemap.xml`, `GET /mcp-guidance.md`

## Testing

- Backend (from `crm/` with venv active):

  ```bash
  cd crm
  pytest tests/test_application_rules.py -q
  pytest tests/test_api.py -q
  ```

- Frontend:

  ```bash
  cd app
  npm run test
  ```

- E2E (Playwright; starts API with `USE_MEMORY_REPOSITORY=true` and Vite — first run may download browsers):

  ```bash
  cd app
  npx playwright install chromium
  npm run test:e2e
  ```

If dependency installation is blocked in your environment, run these commands after network access is available.
