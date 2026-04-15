---
name: git-commit
description: Applies project git commit discipline—staging only related files, conventional one-line messages with allowed tags, cursor-bot identity for author and committer, and keeping branches current with main. Use whenever staging, committing, or when the user invokes git commit workflow.
---

# Git Commit Discipline

Canonical always-on rule: `.cursor/rules/git-commit-discipline.mdc`.

## Scope
- Apply this to every commit workflow in this project.

## Staging Rules
- Stage only files directly related to the work being committed.
- Do not stage unrelated touched files just because they are available.
- Avoid broad staging patterns for commits (for example, `git add .`) unless every changed file is intentionally part of the same scope.

## Commit Message Rules
- Use a single-line commit message.
- Start the line with one allowed tag followed by `:`.
- Allowed tags: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`, `style`, `revert`.
- Format: `<tag>: <meaningful summary>`.
- Make the line specific and meaningful for the actual change set.
- Ensure the message covers what changed and why at a feature/fix level.

## Commit Size And Frequency
- Prefer small, feature-driven commits over large mixed commits.
- Commit frequently during implementation so each commit represents one logical step.
- If a commit is becoming too large, split it into smaller focused commits.

## Stay Current With `main`
- The default integration branch is `main` (use another name only if it is the repo’s real default).
- Many developers merge into `main` often; keep your branch from drifting to avoid painful conflicts and broken integrations.
- During active work, **regularly** incorporate the latest `main` into your branch (for example daily or whenever you resume work on a long-lived branch).
- **Before every push that updates an open PR** (and before opening a PR): fetch and integrate `origin/main` into your branch (`merge` or `rebase`, per team preference), resolve conflicts locally, run tests, then push.
- Do not merge or push a branch you know is far behind `main` without integrating first, unless there is an explicit exception.

## Commit Identity Rules
- Use this identity for every commit:
  - Name: `cursor-bot`
  - Email: `khanovicdev+cursor@gmail.com`
- Set identity for both author and committer on each commit command.
- Do not rely on local git config identity for automated commits.
- Example:
  `git -c user.name="cursor-bot" -c user.email="khanovicdev+cursor@gmail.com" commit --author="cursor-bot <khanovicdev+cursor@gmail.com>" -m "<tag>: <meaningful summary>"`
