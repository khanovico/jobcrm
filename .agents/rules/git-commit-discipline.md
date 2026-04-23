
# Git commit

- Stage **only** files in scope; no `git add .` unless every change belongs in one commit.
- One-line message: `<tag>: <summary>` — tags: `feat` `fix` `refactor` `docs` `test` `chore` `perf` `build` `ci` `style` `revert`.
- Small, frequent commits; split if a commit grows too large.
- Default branch `main` — before **push** or **new PR**: integrate latest `origin/main` (merge/rebase), resolve conflicts, test.
- Identity: 
  - Cursor: `git -c user.name="cursor-bot" -c user.email="khanovicdev+cursor@gmail.com" commit --author="cursor-bot <khanovicdev+cursor@gmail.com>" -m "<tag>: <summary>"`
  - Codex: `git -c user.name="codex-bot" -c user.email="khanovicdev+codex@gmail.com" commit --author="codex-bot <khanovicdev+codex@gmail.com>" -m "<tag>: <summary>"`
