## Execution Workflow for Agents

Follow for all non-trivial implementation tasks.
**NOTE**: Do not wait for human commit request. Commit yourself. Prefer meaningful small commits.

### 1) Plan first
Write a Markdown implementation plan before coding.
Save under `.agents/docs/plans/`.

Plan must include:
- goal and scope
- relevant files and code references
- ordered task groups
- step-by-step TODO checklist
- parallel-safe tasks
- dependencies and merge/conflict risks

Update plan and TODOs as work evolves.
Large task -> split into small chunks with clear completion criteria.

### 2) Execute from plan
Work from plan and checklist step by step.

- keep main agent tied to checklist
- update checklist during progress
- do not jump to unrelated work
- if implementation changes materially, update plan first

### 3) Parallel only when isolated
Use subagents/worktrees only for independent tasks.

- parallelize only non-dependent work
- minimize file overlap and merge conflicts
- prefer one subagent per bounded chunk
- give narrow scope, target files, and acceptance criteria
- if same files or logic likely touched, do not parallelize

Main executor stays on main branch.
Rebase/integrate subagent branches carefully. Resolve conflicts properly.

### 4) Require subagent reports
Every subagent must write a detailed report before handoff.

Store under:
`memory/work-report/<YYYY-MM-DD>-<subagent-tag>-report/<task-name>.md`

Each report must include:
- task summary
- files changed
- key decisions
- tests run and results
- unresolved issues or risks
- branch/worktree name
- commit hash(es)
- exact next-step handoff notes for main agent

Subagent must return report file path to main agent.

### 5) Test before handoff
Before marking work complete, validate changes.

At minimum:
- run most relevant tests for changed area
- run lint/typecheck/build if applicable
- verify no obvious regressions
- summarize results in report

If anything was not tested, say so and explain why.

### 6) Commit cleanly
Leave work in clean git state before handoff.

- create focused readable commits
- keep commits scoped to task
- avoid unrelated changes
- include final commit hash in report

### 8) Review thoroughly
Whenever a big chunk of task/feature is done, bug was fixed, or any changes commited and before PR-ready:
- Spawn @code-reverwer and @scalability-reviewer agents simultaneously.
- Wait for both of them finish reviews.
- Address the issues they report back by going back to step 3) with new requests.

### 7) Main agent owns integration
Main agent is responsible for final integration.

- read every subagent report before merge/continue
- reconcile against master plan and checklist
- resolve cross-task inconsistencies
- rerun final validation after integration
- do not mark task complete until every checklist item is verified

### 8) Safety and shell discipline
Prefer safe minimal commands.

- avoid destructive shell commands unless explicitly required
- avoid broad filesystem operations outside task scope
- escalate only when necessary
- prefer targeted test/build commands over expensive full-project runs
