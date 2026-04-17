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
- Execution mode → 
  Main: `.cursor/workflows/main-execution.md`
- General Execution Rule: Plan first, Plan -> SubPlan -> Todos -> Step by Step

## Memory

Reusable experience → write under `.cursor/memory/` with sensible category.

---
Behavioral guidelines to reduce common LLM coding mistakes.
---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.