---
name: gh-pr-workflow
description: Uses GitHub CLI (gh) to create, update, review, and merge pull requests and inspect PR state. Use when opening a PR, changing title/body/labels, checking CI, requesting review, merging, or when the user mentions gh, GitHub PR, or pull request automation.
---

# GitHub CLI PR Workflow

## Initial setup (gh)

1. **Install** the GitHub CLI (pick one that matches the OS):
   - macOS: `brew install gh`
   - Debian/Ubuntu: see [GitHub CLI install docs](https://cli.github.com/manual/installation) (`apt`/`snap` as appropriate)
   - Windows: `winget install GitHub.cli` or installer from [cli.github.com](https://cli.github.com/)

2. **Authenticate** so `gh` can use your GitHub account:
   ```bash
   gh auth login
   ```
   - Choose **GitHub.com** (or Enterprise host if applicable).
   - Prefer **HTTPS** unless the repo already uses SSH everywhere.
   - Use **Login with a web browser** when possible, or paste a **personal access token** with `repo` scope if non-interactive.

3. **Verify**:
   ```bash
   gh auth status
   ```
   You should see a logged-in user and token scopes (e.g. `repo`).

4. **Repo remote**: ensure `git remote -v` shows GitHub for `origin` (`github.com/org/repo.git`). If not, add or fix `origin` before using `gh pr` on that clone.

5. **Optional**: set default editor for interactive prompts: `gh config set editor "code --wait"` (or your editor).

## Prerequisites (ongoing)

- `gh` installed and authenticated (`gh auth status` succeeds).
- Remote `origin` points at GitHub; branch pushed before `gh pr create` unless using web flow.
- **Branch is up to date with `main`** before you rely on CI or request review (see below).

## Keep your branch up to date with `main`

`main` moves quickly; integrating often limits conflicts and surprise CI failures.

1. **Fetch** latest from GitHub:
   ```bash
   git fetch origin
   ```

2. **Integrate** `main` into your current branch (pick one style and stay consistent with the team):
   - **Merge** (simple, preserves full history):
     ```bash
     git merge origin/main
     ```
   - **Rebase** (linear history; only if your team uses it):
     ```bash
     git rebase origin/main
     ```

3. **Resolve conflicts** locally, run tests, then **push** (use `--force-with-lease` only after a rebase if the branch was already pushed).

4. **Repeat** while the PR is open if `main` advances again—especially before merge or when checks fail due to drift.

5. On GitHub, you can also use **“Update branch”** on the PR when allowed; still verify locally if something breaks.

6. **Check** whether you are behind:
   ```bash
   git status
   gh pr view  # or: gh pr status
   ```

## Create or open a PR

```bash
# From current branch (pushes if needed interactively; or push first)
git push -u origin HEAD

# Create PR targeting base branch (replace main if your default differs)
gh pr create --base main --title "feat: short summary" --body "What changed and why."

# Draft PR
gh pr create --base main --draft --title "wip: feature" --body "..."

# Fill title/body interactively
gh pr create
```

## List and view

```bash
gh pr list
gh pr status
gh pr view
gh pr view 123 --web
gh pr diff
gh pr checks
```

## Update an existing PR

```bash
# Current branch’s PR
gh pr edit --title "feat: new title"
gh pr edit --body-file .tmp/pr-body.md

# By number
gh pr edit 123 --add-label bug --add-reviewer username
```

## Review and merge

```bash
gh pr review --approve --body "LGTM"
gh pr review --request-changes --body "Please adjust X"
gh pr merge --squash --delete-branch
gh pr merge 123 --merge
```

## Useful flags

- `--fill`: use commit messages for title/body (when creating)
- `--fill-first-commit`: first commit only
- `gh pr ready`: move draft to ready

## Coordination with git

- Commit locally with project rules (see `.cursor/skills/git-commit/SKILL.md` for message format and author identity).
- Push, then `gh pr create` or `gh pr view` / `gh pr edit` for the same branch.

## Reporting

After PR actions, state: PR URL or number, base branch, and any failed `gh pr checks` or follow-ups.
