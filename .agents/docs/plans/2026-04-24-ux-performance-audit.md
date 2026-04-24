# UX And Performance Audit Plan

## Goal And Scope
- Find UX and performance issues across JobCRM frontend, API routes, backend repository behavior, and agent-facing flows.
- Produce one dedicated Markdown audit document with severity, short description, evidence, impact, and suggested direction.
- Keep code changes out of scope unless a discovered issue blocks completing the audit.

## Assumptions
- "All UX+Performance related issues" means a high-signal pass over current product surfaces, not an exhaustive formal benchmark.
- Severity levels: Critical, High, Medium, Low.
- Evidence should cite concrete files/routes/behaviors.

## Relevant References
- Product: `.agents/docs/PRD.md`
- Structure: `.agents/docs/PROJECT_STRUCTURE.md`
- Performance memory: `.agents/memory/performance/performance-discipline.md`
- UI memory: `.agents/memory/ui/*`
- Main surfaces: `app/src/pages`, `app/src/components`, `app/src/api.ts`, `crm/app/main.py`, `crm/app/repository.py`

## Task Groups
1. Repository orientation
   - Verify branch state.
   - Read required memory, workflow, PRD, and structure docs.
   - Use code-review-graph before text/file exploration.
2. Frontend UX and performance audit
   - Review data fetch patterns, pagination, loading states, destructive actions, filters, search, notifications, and detail pages.
   - Note repeated full-catalog loads, unbounded DOM, stale cache risk, and confusing interaction states.
3. Backend/API performance audit
   - Review list endpoints, dashboard/search endpoints, repository persistence, Mongo sync, filtering/sorting, agent queues, and write paths.
   - Note O(n) scans, full-collection rewrites, large response payloads, and missing summary endpoints.
4. Documentation
   - Create dedicated audit doc under `.agents/docs/`.
   - Add issues as they are confirmed, with severity and short description.
5. Validation and handoff
   - Run lightweight validation appropriate for docs-only change.
   - Commit focused docs changes.
6. Deep frontend UX pass
   - Re-review every frontend feature/page after user feedback.
   - Expand audit with interaction-flow, design, accessibility, recoverability, and feedback issues.

## TODO
- [x] Create branch.
- [x] Read required workflow, memory, PRD, structure, and available rule lookup.
- [x] Query code-review-graph before text exploration.
- [x] Audit frontend surfaces.
- [x] Audit backend/API surfaces.
- [x] Write dedicated issue document.
- [x] Validate docs-only change.
- [x] Commit.
- [x] Re-open audit for deeper frontend UX review.
- [x] Audit remaining frontend pages/components.
- [x] Expand dedicated issue document with detailed UX findings.
- [x] Validate expanded docs-only change.
- [x] Commit expanded audit.

## Parallel-Safe Work
- Static reads of frontend and backend files are parallel-safe.
- No subagents are used because user requested branch work, not delegated/parallel agent work.

## Dependencies And Risks
- Code-review-graph detailed topology tools partly error in this session; use available stats/large-file graph data, then fallback to targeted `rg` and file reads.
- Audit is static; runtime screenshots and benchmarks are optional and not required for a doc-only task.
