---
name: main-execution
description: Activates main execution mode for this project. Use when the user specifies main-execution mode or asks for strict end-to-end autonomous execution following AGENTS.md and .cursor/workflows/main-execution.md.
---

# Main Execution

## Trigger

Use this skill when execution mode is set to **Main Execution Mode**.

## Instructions

1. Follow `.cursor/workflows/main-execution.md` step by step.
2. Execute end-to-end without waiting for human confirmation between steps. (Unless it's necessary)
3. Stop only when blocked by an unfixable/unignorable issue, then return a detailed report.
4. Before key decisions, check `.cursor/memory/MEMORY.md` for relevant prior lessons.

## Output Expectations

- Keep progress updates concise.
- Include verification evidence (tests/checks run).
- If any bypass is required (for example environment-level blocker), document it clearly in the final report.
