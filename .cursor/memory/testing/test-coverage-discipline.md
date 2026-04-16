# Test Coverage Discipline

## User preference (2026-04-16)
- Every new feature implemented by the agent must include explicit test coverage in the same workstream.

## Reuse guidance
- Add targeted tests first for each new behavior path (happy path + important failure/edge path).
- Cover both backend and frontend when feature spans API + UI behavior.
- After targeted tests pass, run full backend and frontend suites before reporting completion.
