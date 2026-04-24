# Memory Playbook

## Topics
- `bootstrap/` - first-time project initialization and baseline architecture decisions (includes JobCRM MVP runbook notes).
- `bootstrap/backend-env-file-paths.md` - backend settings should resolve `crm/.env` by absolute path so local scripts work from any launch directory.
- `auth/` - login/account provisioning and role-based access rules (admin-only settings/audit, profile read-only for user role).
- `performance/` - always-on scale discipline for fetch/render work (payload size, request frequency, pagination, bounded pickers, stable layout shells during lazy loading).
- `review/` - code-review and audit-quality guardrails to keep status docs trustworthy and actionable.
- `ui/` - frontend UX conventions and review workflow (**no committed screenshots** unless requested; in **cloud/remote** mode, **show chat screenshots** for UI validation after feature work).
- `testing/` - feature-level test coverage discipline (**new features and feature updates require automated tests** in the same change; see `testing/test-coverage-discipline.md`).
- `testing/backend-venv-activation.md` - for backend commands and backend-related logic, activate the repo venv first with `source crm/.venv/bin/activate`.
- `testing/rich-dummy-seed-script.md` - one-command local seed for complete application-detail dummy data.
- `testing/local-dev-dataset-seed.md` - broad one-command local seed for dashboard/list/detail/notification QA coverage.
- `application-workflow/` - reusable patterns for mark/unmark toggle actions across application and per-profile email flows.

## Usage
- Read this file before implementation decisions.
- Follow topic files for reusable patterns and pitfalls.
