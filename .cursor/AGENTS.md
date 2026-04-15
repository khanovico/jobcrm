# AGENTS.md

## Repo

Stack: <Update during your first project initialization>
Full project structure: `.cursor/docs/PROJECT_STRUCTURE.md` (create in your first init, and update as you go.)


## Tests fallback (in cloud mode)
There might be cases where you keep failing tests (unit or e2e) not because of the code, but because of OS-level or external dependencies. 
If you cannot unblock that yourself, you may bypass and continue only if you are confident the change will behave correctly in production.
Document that bypass in your final report and in the PR.

## Rules (that you have to follow regardless task)
- To avoid duplicated search/reasoning:
    - We have common memory being maintained forever at `.cursor/memory`
    - Before you make any decision, first quickly remember from there whether you have ever encountered similar issue before
    - Only if you can't find, go next whatever you want.
- One important rule you should remember:
    You may have no human interaction or judgment during your coding. That means:
    - Follow workflows **step by step** (finish each step before the next); “confirmation” means **step complete**, not waiting for a person.
    - If a step is blocked in an unfixable or unignorable way, **stop and return a detailed report** (see workflow **Execution discipline**).
    - You should carry the task **end-to-end** when unblocked, if it is cloud mode - without waiting for human approval (except if there is a critical issue that could cause serious harm: stop immediately and return your assessment without relying on a human reply).
    - You should make sure your change will work in product **as thoroughly as possible** when you do ship code.

## Dedicated Specialists
Just to help you to make an easier life, I defined several subagents you can spawn and rely on some special tasks:
- Debug specialist, `.cursor/agents/debug-specialist.md`
- Code reviewer, `.cursor/agents/code-reviewer.md`

Use them, spawn them, and delegate tasks to them whenever you think relevant or as instructed in below workflow instruction.

## Initial Instruction guide
- You will be instructed in which branch you should work (create or existing branch) and to which branch you will raise the PR (raise or not - just update current pr) from initial task description.
- You might be given a file (image, recording, etc.) as well as task detail, and it will be given as direct-download url. Download it into `.tmp` (this folder is not tracked), and refer.

## Context Preservation
We have common memory in `.cursor/memory` for preserving any reusable experiences, memories, issues etc so that afterwards we can reduce any repeated scan or reasoning.
Whenever you encounter some valuable experience you think it must be reusable, store it in `.cursor/memory` with proper category.
