# Batch 15: Search, Dashboard, And Audit Investigation UX

## Goal And Scope

Clear:

- `UXPERF-007`: Global search is hard to recognize for applications and scans broad text fields in memory.
- `UXPERF-051`: Audit trail lacks investigation filters, entity links, and metadata expansion.
- `UXPERF-052`: Dashboard cards are not actionable, and search lacks busy/quick investigation states.

Out of scope:

- `UXPERF-003` full repository architecture migration. Batch 15 can add targeted query-backed search paths, but the broader Mongo read-through replacement remains a final isolated batch.
- `UXPERF-022` total-count pagination metadata. Batch 14 fixed phantom next pages; API-wide totals remain separate.

## Approach

- Return compact, recognizable application search summaries with company name, job link/title where available, status, and updated date; update dashboard rendering and tests.
- Add dashboard action links, search loading/empty/error states, and quick filter buttons that route users into useful work queues.
- Add audit filters for actor, entity, action, and date range; render entity links, copyable full IDs, and expandable metadata without needing manual ID copying.

## Relevant Files

- `crm/app/models.py`
- `crm/app/repository.py`
- `crm/app/main.py`
- `crm/tests/test_api.py`
- `app/src/types.ts`
- `app/src/pages/ApplicationsPage.tsx`
- `app/src/pages/CompaniesPage.tsx`
- `app/src/pages/DashboardPage.tsx`
- `app/src/pages/DashboardPage.test.tsx`
- `app/src/pages/AuditPage.tsx`
- `app/src/pages/AuditPage.test.tsx`
- new focused frontend tests as needed

## TODO

- [x] Scope existing search, dashboard, and audit behavior.
- [x] Implement compact application search summaries and backend tests.
- [x] Improve dashboard cards/search UX and frontend tests.
- [x] Improve audit filters, links, metadata expansion, and frontend tests.
- [x] Run targeted backend and frontend tests plus frontend build.
- [x] Run reviewers and address actionable findings.
- [x] Update audit rows for cleared Batch 15 issues.
- [x] Commit Batch 15 and merge back into `codex/ux-performance-audit`.

## Parallel Work

- Worker A owns search result contract plus dashboard rendering/tests.
- Worker B owns audit investigation UI/tests.
- Main agent owns integration, backend review, validation, docs, and merge.

## Success Criteria

- Search application results are recognizable without opening each row and avoid returning full application payloads for dashboard search display.
- Dashboard metric cards move users directly to the relevant filtered work queues and search communicates loading/empty states.
- Audit users can narrow events, follow entity links, copy full IDs, and inspect metadata inline.

## Validation

- `source .venv/bin/activate && pytest tests/test_api.py -q` passed: 94 tests.
- `npx vitest run --pool=forks --minWorkers=1 --maxWorkers=1` passed: 144 tests.
- `npm run build` passed.
- Reviewers reported no critical findings. Addressed code-review warning for `/applications` query clearing and scalability warnings for audit indexes, lazy/cached applied-profile facets, and projected Mongo search summaries. The remaining company-name contains search warning is an existing broader search/indexing concern, not introduced by this batch.
