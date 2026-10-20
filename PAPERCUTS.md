# Papercuts — Scryproof

Friction hit while building (tools, shell, process), newest first. Not feature bugs.

- **2026-10-04 · a web test is timing-flaky** — `npm test --workspace web` failed 1 of 556 once after a theme-only edit (no test touches themes), then passed three runs in a row unchanged. The failing test's name was lost because the output was filtered down to the totals line. Next time it fails, keep the full output and name the test.

- **2026-10-04 · junctioned node_modules + git worktree remove wiped the working copy** — To test Matt's PRs without reinstalling, I junctioned main's `node_modules` (and `web/`, `server/`, `desktop/` ones) into throwaway worktrees. Cleanup unlinked the workspace junctions but missed the root one, then `git worktree remove --force` recursed through it: root `node_modules/@scryproof/{web,server,shared}` are npm junctions back to the real `web/`, `server/`, `shared/` folders, so it emptied all three in the main checkout (498 tracked files, both node_modules, and ignored files like `server/.data/`). Caught by `git status` right after. Tracked files came back with `git restore .`, deps with `npm ci`; the ignored local files are gone for good. The signing key lives in `~/.scryproof/`, outside the repo, and was safe.
  Rule (Wes): no temp copies. Test friends' branches in the one real checkout (`git checkout --detach origin/<branch>`, test, switch back). If dependencies changed, delete `node_modules` and `npm ci`.

## 2026-10-10 A trailing `//` comment on a one-line block ate the rest of the line, twice
Both `store.mjs` and `passalong.js` keep `if (...) { a; b; return c; }` on one line. Adding `// why` after the opening brace commented out the close, and `node --check` only caught it when run again. Rule: comments on these files go on their own line above; run `node --check` after every edit, not once per phase.

## 2026-10-10 A store from the night before was still on 8766
`node store.mjs --port 8766 &` with output to /dev/null failed on address-in-use and the page checks ran against yesterday's store (old code, old dir) without anyone noticing until a header was missing. Rule: before a local store run, `netstat -ano | grep :8766`, and never discard the store's stdout.

## 2026-10-10 Bash heredoc with apostrophes, again
A `cat > file <<EOF` with apostrophes in the body died with "unexpected EOF while looking for matching quote" (the tool wraps the command in single quotes). Rule: any file body with an apostrophe goes through the Write tool, not a heredoc. Second time this session.

## 2026-10-10 Phantom module-not-found while another agent commits
The server suite failed once with ERR_MODULE_NOT_FOUND for a file that exists, at the moment a parallel agent committed a .gitattributes change that rewrote checkout line endings. Rerun passed. Rule: when agents share one checkout, rerun a load-time failure once before believing it, and run the full suite only after all agents have committed.

## 2026-10-12 Electron probe scripts print nothing and data: pages have no mediaDevices
electron.exe is a GUI program on Windows, so console.log from a scratch probe goes nowhere under the shell; and a `data:` URL is not a secure context, so `navigator.mediaDevices` is undefined. Rule: probes write their log to a file and load their page with `loadFile`; each probe folder needs a package.json with `main`. Also: test tones are loud to Wes; keep probes silent (route to a muted device) or warn first.

## 2026-10-14 Chrome cannot be made to share system audio without a human on the picker
`--auto-select-desktop-capture-source` picks the screen but skips the dialog, and the system-audio box lives in the dialog, so `getDisplayMedia` returns no audio track. `--use-fake-ui-for-media-stream` returns an audio track, but it is the fake device, not loopback, so any measurement of what is in the share is meaningless. Rule: a browser-side share-sound check needs the real picker (hand-driven) or a real friend; do not read a fake-UI run as evidence.

## 2026-10-14 A pass/fail that compares against a floor at digital silence fails on nothing
The whole-screen share check said "440 Hz stands out 12 dB" over a floor of -138 dB, which is silence, while a real leak would sit 50 dB higher. Rule: when the floor can be digital silence, compare a suspect pitch against a known signal (the tone programs), not against the floor.

## 2026-10-19 A long Python patch inside a bash heredoc died with "unexpected EOF while looking for matching `'`"
A ~160-line `python - <<'EOF'` script holding JSX strings with `\"` and backticks failed to parse as a bash command at all. Rule: anything over a screen goes in a scratchpad `.py` file written with the Write tool and run with `python -I path`; keep heredocs for one-screen scripts.
