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

### Python backend runtime env

1. Create virtual environment:
  - `python3 -m venv crm/.venv`
2. Activate it:
  - `source crm/.venv/bin/activate`
3. Install backend dependencies:
  - `pip install -r crm/requirements.txt`

### Frontend/backend env files

- `crm/.env`:
  - `JWT_SECRET=change-me`
  - `JWT_ALGORITHM=HS256`
  - `JWT_EXP_MINUTES=120`
  - `MONGO_URI=mongodb://mongo:27017`
  - `MONGO_DB_NAME=jobcrm`
- `app/.env`:
  - `VITE_API_URL=http://localhost:8000`

### Start with Docker

1. Start services:
  - `docker compose up --build`
2. Access:
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