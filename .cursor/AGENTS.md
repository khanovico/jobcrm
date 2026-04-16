# AGENTS.md

## Repo

- Stack: set at project init.
- PRD: `.cursor/docs/PRD.md`
- Structure: `.cursor/docs/PROJECT_STRUCTURE.md` (create/update as you go)

## Tests (cloud)

Failing tests only due to OS/deps you can’t fix → may bypass if change is clearly correct in prod. **Document bypass** in final report + PR.

## Always

- **Memory first:** `.cursor/memory` — check before big decisions; add reusable lessons there.
- **No waiting on humans** (unless serious harm): workflows step-by-step; “confirm” = step done. Blocked unfixably → **stop + detailed report**. Unblocked → **end-to-end**. Ship as verified as practical.

## Subagents

- Debug: `.cursor/agents/debug-specialist.md`
- Review: `.cursor/agents/code-reviewer.md`  
  Spawn when useful or instructed.

## Task intake

- Branch / PR target from task.
- Assets via URL → save under `.tmp/` (untracked).
- Execution mode → e.g. Main: `.cursor/workflows/main-execution.md`

## Memory

Reusable experience → write under `.cursor/memory/` with sensible category.
