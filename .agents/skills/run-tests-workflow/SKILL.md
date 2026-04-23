---
name: run-tests-workflow
description: Run JobCRM tests in the right order for the change scope, starting with targeted checks and expanding to broader confidence runs across `app/` and `crm/`. Use when implementing features, fixing bugs, refactoring, validating changes before commit or PR, or deciding which build and test commands this repository expects.
---

# Run Tests Workflow

Use this skill for repository-specific test execution in JobCRM. Prefer fast targeted checks first, then broader confidence checks that match the risk of the change.

## Decide what to run

- For frontend code in `app/src`, start with targeted Vitest runs and finish with `cd app && npm run build`.
- For frontend user-flow changes, routing, auth, or browser behavior, add Playwright coverage in `app/`.
- For backend code in `crm/app` or API behavior, run targeted `pytest` commands from `crm/`.
- For cross-stack changes, run both frontend and backend checks.

## JobCRM command playbook

### Frontend unit and component tests

Run from `app/`.

```bash
npm run test -- src/path/to/file.test.tsx
```

If file filtering is awkward, use Vitest directly:

```bash
npx vitest run src/path/to/file.test.tsx
```

For broader frontend confidence:

```bash
npm run test
```

### Frontend build check

For any frontend change, this repository expects:

```bash
cd app && npm run build
```

Treat a failing frontend build as a blocker unless the failure is clearly caused by environment or dependency issues you cannot fix in the current environment.

### Frontend E2E

Run from `app/` when the change affects flows that are best validated in a browser:

```bash
npm run test:e2e -- tests/path/to/spec.ts
```

Or broader:

```bash
npm run test:e2e
```

### Backend tests

Run from `crm/`.

```bash
pytest tests/test_file.py -q
pytest tests/test_file.py::test_name -q
pytest -q
```

## Execution order

1. Identify the changed surface area.
2. Run the smallest meaningful targeted tests first.
3. Fix failures before expanding scope.
4. Run broader impacted suites.
5. Run `cd app && npm run build` for frontend changes.
6. Add E2E only when user-facing flow risk justifies it.

## Failure handling

- Separate real regressions from environment-only failures.
- Do not hide or disable failing tests to force a green run.
- If a failure is unrelated but blocks progress, report it clearly with the command and error summary.
- If a test fails only because of OS or dependency limits you cannot fix, you may bypass it only when the code change is still clearly correct for production behavior.

## Reporting

After running tests, report:

- commands run
- which commands passed or failed
- whether frontend build verification was run
- likely root cause for any failures
- whether any test or build was bypassed due to environment limits

If you bypass a test or build because of OS or dependency constraints, explicitly document that bypass in the final report and in the PR summary when applicable.
