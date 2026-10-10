# Papercuts — Scryproof

Friction hit while building (tools, shell, process), newest first. Not feature bugs.

- **2026-10-04 · a web test is timing-flaky** — `npm test --workspace web` failed 1 of 556 once after a theme-only edit (no test touches themes), then passed three runs in a row unchanged. The failing test's name was lost because the output was filtered down to the totals line. Next time it fails, keep the full output and name the test.

- **2026-10-04 · junctioned node_modules + git worktree remove wiped the working copy** — To test Matt's PRs without reinstalling, I junctioned main's `node_modules` (and `web/`, `server/`, `desktop/` ones) into throwaway worktrees. Cleanup unlinked the workspace junctions but missed the root one, then `git worktree remove --force` recursed through it: root `node_modules/@scryproof/{web,server,shared}` are npm junctions back to the real `web/`, `server/`, `shared/` folders, so it emptied all three in the main checkout (498 tracked files, both node_modules, and ignored files like `server/.data/`). Caught by `git status` right after. Tracked files came back with `git restore .`, deps with `npm ci`; the ignored local files are gone for good. The signing key lives in `~/.scryproof/`, outside the repo, and was safe.
  Rule (Wes): no temp copies. Test friends' branches in the one real checkout (`git checkout --detach origin/<branch>`, test, switch back). If dependencies changed, delete `node_modules` and `npm ci`.

## 2026-10-10 Bash heredoc with apostrophes, again
A `cat > file <<EOF` with apostrophes in the body died with "unexpected EOF while looking for matching quote" (the tool wraps the command in single quotes). Rule: any file body with an apostrophe goes through the Write tool, not a heredoc. Second time this session.
