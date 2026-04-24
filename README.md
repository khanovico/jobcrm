# JobCRM

JobCRM is half CRM and half MCP-oriented agent automation system for job applications.

The CRM side keeps the human workflow organized: companies, industries, candidate profiles, applications, dashboard search, application status tracking, notifications, audit history, company research fields, resume/profile context, outreach recipients, cold email drafts, and applied/email-sent actions.

The agent side gives an AI assistant (JAA) a secured API-key surface for company-to-registered-profile matching and application preparation. Agents can poll work queues, research companies, store fit analysis, attach tailored resume links, draft pitching and cold email strategy, create outreach emails, update preparation statuses, and leave the user with reviewable CRM records instead of scattered artifacts.

## Stack

- Frontend: React + TypeScript + Vite + Tailwind + daisyUI
- Backend: FastAPI + Pydantic + JWT/API-key auth + MongoDB
- Local orchestration: Docker Compose

## Run Locally

Create env files once:

```bash
cp crm/.env.example crm/.env
cp app/.env.example app/.env
```

### Docker

```bash
docker compose up --build
```

- App: `http://localhost:5173`
- API: `http://localhost:8511`
- MongoDB: `localhost:27017`

For the Docker app to call the Docker API from the browser, set `app/.env` to:

```bash
VITE_API_URL=http://localhost:8511
```

### Hot Reload

Run Mongo in Docker:

```bash
docker compose up -d mongo
```

Run the backend:

```bash
python3 -m venv crm/.venv
source crm/.venv/bin/activate
pip install -r crm/requirements.txt
cd crm
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run the frontend:

```bash
cd app
npm install
npm run dev
```

For this mode, use `VITE_API_URL=http://localhost:8000` in `app/.env` and `MONGO_URI=mongodb://127.0.0.1:27017` in `crm/.env`.

## Useful Commands

```bash
cd app && npm run build
cd app && npm run test
cd crm && pytest
```

Agent-facing docs are served from the web app at `/llm.txt`, `/sitemap.xml`, and `/mcp-guidance.md`; OpenAPI is available from the backend at `/docs`.
