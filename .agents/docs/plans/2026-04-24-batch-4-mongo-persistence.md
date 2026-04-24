# Batch 4 - Mongo Persistence Hot Path

## Branch
- Work branch: `codex/uxperf-batch-4-mongo-persistence`
- Integration branch: `codex/ux-performance-audit`

## Goal
Clear the next critical backend performance tickets:
- UXPERF-001: Mongo writes must stop deleting and reinserting every collection on normal mutations.
- UXPERF-002: Agent bulk company updates must stop triggering repeated full database rewrites.

## Scope
- Backend only.
- Primary files:
  - `crm/app/repository.py`
  - `crm/app/main.py`
  - `crm/tests/test_api.py`
  - `.agents/docs/UX_PERFORMANCE_AUDIT_2026-04-24.md`
- No frontend changes planned.

## Approach
- Replace `MongoRepository._sync()` use on normal writes with per-collection document replacement/deletion helpers.
- For methods that can mutate multiple collections, persist only affected collections.
- Add bulk-persistence helpers around agent bulk company updates so updates and audit events persist once per request instead of once per row.
- Keep `InMemoryRepository` behavior unchanged.
- Add tests with Mongo-like fake collection objects that fail if `delete_many({})` is called during normal writes.

## Parallel Work
- Explorer subagent maps `_sync()` call sites, multi-collection mutations, and regression test risks.
- Main agent implements and validates.

## TODO
- [x] Create batch branch from integration branch.
- [x] Create batch plan.
- [x] Start explorer mapping task.
- [x] Read repository/main/test write paths.
- [x] Implement targeted Mongo persistence helpers.
- [x] Implement batch persistence support for agent bulk company updates.
- [x] Add focused backend regression tests.
- [x] Run targeted backend tests.
- [x] Run full backend API suite.
- [x] Run code-reviewer and scalability-reviewer with longer waits.
- [x] Update audit checkboxes for UXPERF-001 and UXPERF-002.
- [ ] Commit work branch.
- [ ] Merge batch branch back into `codex/ux-performance-audit`.
