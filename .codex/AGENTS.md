# Codex Rule Lookup

Use this file as the Codex-specific lookup layer for shared repository rules.

## Source Of Truth

- Canonical reusable rule bodies live under `.agents/rules/`.
- Do not duplicate full rule bodies in `.codex`.
- When a task touches one of the areas below, read the matching canonical rule file before making changes.

## Core Rules

- Commit discipline: `.agents/rules/git-commit-discipline.md`
- Memory preservation: `.agents/rules/memory-preservation.md`
- TDD and test coverage: `.agents/rules/tdd-and-test-coverage-discipline.md`
- Caveman mode: `.agents/rules/caveman-mode.md`

## Frontend Rules

- TypeScript fundamentals: `.agents/rules/frontend/frontend-typescript-rules.md`
- React: `.agents/rules/frontend/react-frontend-rules.md`
- Tailwind and DaisyUI: `.agents/rules/frontend/tailwind-daisyui-frontend-rules.md`
- TypeScript code quality: `.agents/rules/frontend/typescript-frontend-code-quality-rules.md`
- TypeScript organization: `.agents/rules/frontend/typescript-frontend-organization-rules.md`

## Backend Rules

- Backend configuration: `.agents/rules/backend/backend-configuration-rules.md`
- Backend logging and observability: `.agents/rules/backend/backend-logging-observability-rules.md`
- Backend project structure: `.agents/rules/backend/backend-project-structure-rules.md`
- Backend testing: `.agents/rules/backend/backend-testing-rules.md`
- Backend error handling: `.agents/rules/backend/error-handling-backend-rules.md`
- FastAPI backend: `.agents/rules/backend/fastapi-backend-rules.md`
- FastAPI routing: `.agents/rules/backend/fastapi-routing-rules.md`
- Backend performance: `.agents/rules/backend/performance-backend-rules.md`
- Pydantic: `.agents/rules/backend/pydantic-backend-rules.md`
- Python backend principles: `.agents/rules/backend/python-backend-principles.md`

## Testing Rules

- Jest unit testing: `.agents/rules/testing/jest-unit-testing-rules.md`
- Playwright accessibility: `.agents/rules/testing/playwright-accessibility-rules.md`
- Playwright API: `.agents/rules/testing/playwright-api-rules.md`
- Playwright E2E: `.agents/rules/testing/playwright-e2e-rules.md`
- Playwright integration: `.agents/rules/testing/playwright-integration-rules.md`

## Related Shared Guidance

- Main repo instructions: `AGENTS.md`
- Shared docs: `.agents/docs/`
- Shared memory: `.agents/memory/`
- Shared workflows: `.agents/workflows/`
- Shared skills: `.agents/skills/`
