# Batch 6: Agent Queue And Detail Hot Paths

## Goal And Scope

Clear the next high-impact backend/API performance tickets from the UX/performance audit:

- `UXPERF-008`: agent queue endpoints should use indexed queue reads and return compact task summaries.
- `UXPERF-009`: application detail should batch-load PPA emails instead of scanning all emails once per PPA.

Out of scope for this batch:

- `UXPERF-003` full startup collection load removal. This batch reduces hot request paths but does not remove `MongoRepository._load()`.
- Frontend application-list/new-application UX tickets. Explorers are mapping those for later batches.

## Relevant Files

- `crm/app/models.py`: add compact agent queue response models.
- `crm/app/repository.py`: add batch email lookup, direct Mongo queue queries, compact Mongo projections, and required indexes.
- `crm/app/main.py`: switch agent queue routes to compact summaries and application detail to one batched email lookup.
- `crm/tests/test_api.py`: repository-level Mongo query/projection and batch-email regressions.
- `crm/tests/test_mvp_agent.py`: route-level agent queue response shape regressions.
- `app/src/agent-instructions/files/api-contracts.md`, `llm.txt`, `mcp-guidance.md`: agent-facing contract docs.
- `.agents/docs/UX_PERFORMANCE_AUDIT_2026-04-24.md`: mark only verified tickets checked.

## TODO

- [x] Add compact queue response models and repository interfaces.
- [x] Implement in-memory and Mongo query-backed queue summaries.
- [x] Implement batched `list_emails_for_ppas()` and use it in application detail.
- [x] Implement batched profile-name lookup for application detail.
- [x] Add agent company detail follow-up route for compact company queue tasks.
- [x] Add indexes for queue and email-detail query paths.
- [x] Update agent API docs to tell agents to fetch full records after selecting a task id.
- [x] Add focused API/repository tests.
- [x] Run targeted backend tests; full backend tests remain for after merge.
- [x] Run code review and scalability review; address findings.
- [ ] Commit batch branch, merge into `codex/ux-performance-audit`, update audit checkboxes, and commit docs.

## Parallel Work

- Read-only explorers are mapping non-overlapping frontend clusters for later batches:
  - Application list/new application flow.
  - Shared modal/profile/industry destructive UX.

## Risks

- Agent API response shape changes from full objects to summaries. Mitigation: keep core identifiers/status/company/job link/timestamps, update docs, and preserve full-detail endpoints for follow-up reads.
- Mongo fake test helpers need projection support. Keep projection implementation minimal and covered only for fields used by these routes.

## Validation

- Focused queue/detail regressions: passed.
- Affected API/agent suites: `88 passed`.
- `python -m compileall -q crm/app`: passed.
- Code review: pass for `UXPERF-008/009`.
- Scalability review: pass for `UXPERF-008/009`; non-blocking follow-ups are legacy Mongo normalization and future summary-first email body loading.
