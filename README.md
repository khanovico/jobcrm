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

## Run Locally

1. Copy environment files:
  - `cp crm/.env.example crm/.env`
  - `cp app/.env.example app/.env`
2. Start services:
  - `docker compose up --build`
3. Access:
  - Frontend: `http://localhost:5173`
  - Backend: `http://localhost:8000`

## API Highlights

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET/POST/PUT/DELETE /api/v1/companies`
- `GET/POST/PUT/DELETE /api/v1/profiles`
- `GET/POST/PUT/DELETE /api/v1/applications`
- `POST /api/v1/applications/{id}/mark-applied`

## Testing

- Backend (targeted):
  - `pytest tests/test_application_rules.py -q`
  - `pytest tests/test_api.py -q`
- Frontend:
  - `npm run test`

If dependency installation is blocked in your environment, run these commands after network access is available.