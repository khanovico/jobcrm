---
name: run-tests-workflow
description: Runs project tests in a reliable development workflow across frontend and backend, including targeted-first execution, failure triage, and clear reporting. Use when implementing features, refactoring, debugging, or validating changes before commit/PR.
---

# Run Tests Workflow

## Purpose

Use this skill to run tests correctly during code development, not only final QA.
Prioritize fast feedback first, then confidence checks.

## When To Apply

Apply this skill whenever code is changed:
- new feature implementation
- bug fixes or refactors
- dependency/config changes
- before commit or pull request

## Test Execution Order

1. **Detect available test stacks**
   - Frontend: `npm`, `pnpm`, or `yarn` scripts (unit/component/e2e).
   - Backend: `pytest` or framework-specific test commands.
2. **Run targeted tests first**
   - Run only tests related to changed modules/files.
   - Prefer the smallest meaningful subset for fast feedback.
3. **Run broader suite for confidence**
   - After targeted tests pass, run broader impacted suite.
   - For high-risk changes, run full relevant frontend/backend suites.
4. **Run integration/E2E when needed**
   - Trigger for routing, API contract, auth, state flow, or critical user journey changes.
5. **Re-run failed tests after fixes**
   - Reproduce failure deterministically.
   - Fix root cause, then re-run failing set and impacted neighbors.

## CLI Command Playbook

Run commands from the relevant project root (`frontend/`, `app/`, `backend/`, etc.).

### 1) Detect available test commands

```bash
# frontend scripts
npm run
# or
pnpm run
# or
yarn run

# backend tooling
pytest --version
```

### 2) Targeted tests first (fast feedback)

```bash
# Jest / unit (single file)
npm run test -- --runInBand path/to/file.test.ts
pnpm test -- --runInBand path/to/file.test.ts
yarn test --runInBand path/to/file.test.ts

# Playwright (single spec or grep)
npx playwright test tests/e2e/login.spec.ts
npx playwright test --grep "login"

# Pytest (single file or test)
pytest tests/test_feature.py -q
pytest tests/test_feature.py::test_specific_case -q
```

### 3) Broader impacted suite

```bash
# frontend unit/integration
npm run test -- --runInBand
pnpm test -- --runInBand
yarn test --runInBand

# backend full suite
pytest -q
```

### 4) High-confidence checks (critical changes)

```bash
# E2E full run
npx playwright test

# accessibility/API subsets when configured
npx playwright test tests/a11y
npx playwright test tests/api
```

### 5) Re-run only failed tests after fixes

```bash
# Jest
npm run test -- --onlyFailures
pnpm test -- --onlyFailures
yarn test --onlyFailures

# Playwright
npx playwright test --last-failed

# Pytest (requires prior cache)
pytest --lf -q
```

## Failure Triage Rules

- Separate flaky/environment failures from real regressions.
- Treat deterministic failures as blockers; do not ignore.
- If a failure is unrelated but blocking, report clearly with evidence.
- Do not disable tests to pass CI unless explicitly instructed.

## Coverage Expectations

- Verify happy path, error path, and key edge cases for changed behavior.
- Add or update regression tests for bug fixes.
- If gaps remain, explicitly report missing coverage and follow-up actions.

## Reporting Format

After test execution, report:
- commands run
- pass/fail summary
- failing tests and likely root cause
- what was fixed and what remains

## Practical Defaults

- Prefer deterministic, non-watch mode for automation.
- Use targeted runs in local development; use broader runs before handoff.
- Keep test runtime reasonable while preserving confidence.
