# JobCRM Project Structure

## Root
- `app/` - React + TypeScript frontend (Vite, Tailwind, daisyUI)
- `crm/` - FastAPI backend (JWT auth, CRUD, status workflow)
- `docker-compose.yml` - local orchestration for app, API, and MongoDB
- `.cursor/docs/PRD.md` - product requirements reference

## Backend (`crm/`)
- `app/main.py` - API routes and request handling
- `app/models.py` - Pydantic models and application status transition rules
- `app/auth.py` - password hashing and JWT token logic
- `app/deps.py` - auth dependency and repository provider
- `app/repository.py` - in-memory repository with Mongo sync implementation
- `tests/test_application_rules.py` - transition rule tests
- `tests/test_api.py` - API auth/CRUD/mark-applied tests

## Frontend (`app/`)
- `src/main.tsx` - app bootstrap and router provider
- `src/App.tsx` - route definitions and auth gate
- `src/auth.tsx` - token/session context
- `src/api.ts` - API client and CRUD wrappers
- `src/components/Layout.tsx` - top nav, sidebar, theme toggle
- `src/pages/` - Dashboard, Login, Companies, Profiles, Applications pages
- `src/pages/ApplicationsPage.test.tsx` - mark-applied interaction test
- `src/App.test.tsx` - auth redirect route test
