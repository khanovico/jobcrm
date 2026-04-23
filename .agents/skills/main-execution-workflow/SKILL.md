---
name: main-execution-workflow
description: Execute non-trivial JobCRM tasks with the repository's main execution workflow. Use when Codex needs to take a concrete task request, turn it into a written implementation plan, run the work step by step, coordinate any isolated parallel subagent work, validate changes, and commit progress without waiting for a human commit request.
---

# Main Execution Workflow

## Overview

Run JobCRM work by the repo workflow in `.agents/workflows/main-execution.md`.
Turn the user task into a written plan, execute from that plan, validate the result, and keep git state clean.

## Workflow

### 1. Read required repo context

Read these files before acting:

- `.agents/workflows/main-execution.md`
- `.agents/memory/MEMORY.md`
- any relevant topic file under `.agents/memory/`
- `.agents/docs/PRD.md` when scope or product behavior matters
- `.agents/docs/PROJECT_STRUCTURE.md` when locating files or adding new areas

### 2. Convert task into written plan

For any task larger than a tiny edit, create a Markdown plan in `.agents/docs/plans/`.
Include:

- goal and scope
- relevant files and code references
- ordered task groups
- TODO checklist
- parallel-safe work
- dependencies and merge/conflict risks

Update the plan when implementation changes materially.

### 3. Execute from plan

Work checklist-first.
Do not improvise across unrelated areas.
Keep changes surgical and tied to the task.

### 4. Use subagents only for isolated chunks

Split only independent work.
Avoid overlap in files or logic.
Give each subagent:

- bounded scope
- file ownership
- acceptance criteria

Keep main integration on the main branch.
Read subagent reports before merging or continuing.

### 5. Validate before handoff

Run the smallest meaningful tests first.
Expand only as risk justifies.
For frontend changes, run `cd app && npm run build`.
If validation cannot run because of environment or dependency limits, report the exact bypass and reason.

Use `.agents/skills/run-tests-workflow/SKILL.md` when deciding repository test commands.

### 6. Run review-stage subagents

After implementation and local validation, run review in parallel when useful.

Default review stage:

- spawn @code-reviewer subagent
- spawn @scalability-reviewer subagent for frontend, API, data-fetching, payload-size, render-cost, or other performance-sensitive work

Give each subagent the changed scope and ask for findings, risks, regressions, and missing test coverage.
Read both reports before final integration or closeout.
Address actionable findings or explain why not.

### 7. Commit cleanly

Do not wait for a human to request commits.
Create focused commits for meaningful chunks.
Do not mix unrelated changes.

### 8. Finish with explicit reporting

Report:

- plan path
- files changed
- tests/builds run
- failures or bypasses
- risks or follow-up items

If you created reusable project knowledge, add it under `.agents/memory/`.
