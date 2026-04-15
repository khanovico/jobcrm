---
name: git-commit
description: Commit discipline for direct-file staging and small feature-driven commits
---

# Git Commit Discipline

## Scope
- Apply this rule to every commit workflow in this project.

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

## Commit Identity Rules
- Use this identity for every commit:
  - Name: `cursor-bot`
  - Email: `khanovicdev+cursor@gmail.com`
- Set identity for both author and committer on each commit command.
- Do not rely on local git config identity for automated commits.
- Example:
  `git -c user.name="cursor-bot" -c user.email="khanovicdev+cursor@gmail.com" commit --author="cursor-bot <khanovicdev+cursor@gmail.com>" -m "<tag>: <meaningful summary>"`
