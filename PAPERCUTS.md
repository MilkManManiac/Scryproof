# Papercuts — Scryproof

Friction hit while building (tools, shell, process), newest first. Not feature bugs.

- **2026-10-04 · junctioned node_modules + git worktree remove wiped the working copy** — To test Matt's PRs without reinstalling, I junctioned main's `node_modules` (and `web/`, `server/`, `desktop/` ones) into throwaway worktrees. Cleanup unlinked the workspace junctions but missed the root one, then `git worktree remove --force` recursed through it: root `node_modules/@scryproof/{web,server,shared}` are npm junctions back to the real `web/`, `server/`, `shared/` folders, so it emptied all three in the main checkout (498 tracked files, both node_modules, and ignored files like `server/.data/`). Caught by `git status` right after. Tracked files came back with `git restore .`, deps with `npm ci`; the ignored local files are gone for good. The signing key lives in `~/.scryproof/`, outside the repo, and was safe.
  Rule: never link node_modules into a worktree. Run `npm ci` inside the worktree. If a junction exists anyway, `cmd /c rmdir` every one of them (`find -type l`) and confirm none are left before any recursive delete or `git worktree remove`.
