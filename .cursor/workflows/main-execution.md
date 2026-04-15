## Execution Workflow for Agents

Follow this workflow for all non-trivial implementation tasks.

### 1) Plan first
Before writing code, create a written implementation plan in Markdown. Do not keep the plan only in memory.

- Use Plan Mode first whenever the task is more than a tiny edit.
- Save the plan as a workspace file under `.cursor/docs/plans/`.
- The plan must include:
  - goal and scope
  - relevant files and code references
  - ordered task groups
  - a step-by-step TODO checklist
  - which tasks are safe to run in parallel
  - dependencies and merge/conflict risks
  - As progress goes, TODO list or task list can also be updated accordingly.

If the task is large, break it into small task chunks. Each chunk should have its own checklist and clear completion criteria.

### 2) Execute from the plan, not from improvisation
Execution must follow the plan and TODO checklist step by step.

- Keep the main agent tied to the checklist at all times.
- Update the checklist as work progresses.
- Do not jump ahead to unrelated work.
- If the implementation changes materially from the original plan, update the plan file first, then continue.

### 3) Use isolated worktrees for parallelizable tasks
If tasks are independent and can be done safely in parallel, delegate them to subagents using `/worktree`.

- Only parallelize tasks that do not depend on each other.
- Split work to minimize file overlap and merge conflicts.
- Prefer one subagent per clearly bounded chunk.
- Give each subagent a narrow scope, clear file targets, and explicit acceptance criteria.
- If two tasks are likely to touch the same files or logic, do not run them in parallel.

Main executor should have to be remaining in main branch.
And rebase from subagents' working branch with properly addressed rebase conflicts (if there is any)

### 4) Require structured subagent reports
Every subagent must return a detailed written report before handoff.

Store reports under:

`memory/work-report/<YYYY-MM-DD>-<subagent-tag>-report/<task-name>.md`

Each report must include:
- task summary
- files changed
- key decisions made
- tests run and results
- unresolved issues or risks
- branch/worktree name
- commit hash(es)
- exact next-step handoff notes for the main agent

After finishing, the subagent must give the main agent the report file path.

### 5) Test before handoff
Before a subagent marks work complete, it must validate its changes.

At minimum:
- run the most relevant tests for the changed area
- run lint/typecheck/build checks if applicable (you have rules for testing)
- verify no obvious regressions were introduced
- summarize results in the report file

Do not mark work complete if validation was skipped. If something could not be tested, state that explicitly and explain why.

### 6) Commit cleanly
Before handoff, each subagent should leave work in a clean git state.

- Create focused, readable commits
- Keep commits scoped to the task
- Avoid mixing unrelated changes
- Include the final commit hash in the report
(you have rules for commit convention)

### 7) Main agent integration rules
The main agent is responsible for final integration.

- Read every subagent report before merging or continuing
- Reconcile changes against the master plan and checklist
- Resolve cross-task inconsistencies
- Re-run final validation after integrating parallel work
- Do not mark the overall task complete until every checklist item is verified

### 8) Safety and shell discipline
Prefer safe, minimal, sandbox-friendly commands.

- Avoid destructive shell commands unless explicitly required
- Avoid broad filesystem operations outside the task scope
- Escalate only when necessary
- Prefer targeted test/build commands over expensive full-project commands when a narrow check is enough