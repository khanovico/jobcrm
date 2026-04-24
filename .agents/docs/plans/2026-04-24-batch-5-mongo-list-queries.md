# Batch 5 - Mongo List Query Hot Paths

## Branch
- Work branch: `codex/uxperf-batch-5-mongo-list-queries`
- Integration branch: `codex/ux-performance-audit`

## Goal
Clear UXPERF-004 by moving core paged Mongo list reads away from full in-memory scans.

## Scope
- Backend only.
- Primary files:
  - `crm/app/repository.py`
  - `crm/tests/test_api.py`
  - `.agents/docs/UX_PERFORMANCE_AUDIT_2026-04-24.md`
- Target MongoRepository list methods:
  - `list_companies`
  - `list_profiles`
  - `list_applications`
  - `list_audit_events`
  - `list_notifications`

## Non-Goals
- Do not clear UXPERF-003 in this batch; `MongoRepository._load()` still loads collections at startup.
- Do not change frontend list response contracts or add pagination metadata.
- Do not refactor unrelated in-memory repository behavior.

## Approach
- Add Mongo document hydration helpers that do not mutate raw DB rows.
- Build bounded Mongo filters, sort specs, skip, and limit for each target list method.
- Keep application list enrichment page-bounded by querying companies, PPAs, and profiles for the returned page only.
- Add fake Mongo cursor tests that assert list methods use collection `find`, `sort`, `skip`, and `limit` instead of in-memory collection scans.
- Update UXPERF-004 only if the shipped scope and tests match the audit row.

## Parallel Work
- Explorer subagent maps exact query semantics and missing tests.
- Main agent owns implementation, tests, review, commit, and integration.

## TODO
- [x] Create batch branch from integration branch.
- [x] Create batch plan.
- [x] Start explorer mapping task.
- [x] Implement Mongo query-backed list helpers.
- [x] Add focused Mongo list query regression tests.
- [x] Run targeted backend tests.
- [x] Run full backend tests.
- [x] Run code-reviewer and scalability-reviewer with longer waits.
- [x] Update audit checkbox for UXPERF-004.
- [ ] Commit work branch.
- [ ] Merge batch branch back into `codex/ux-performance-audit`.
