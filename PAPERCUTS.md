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

## 2026-10-19 Backslash-u escapes in tool input land on disk as the real characters
Writing a regex with `\u202e`-style escapes (Write tool, and once through a bash heredoc into Python) put the literal invisible direction-override characters into `stream-chat.ts` instead of the six-character escapes. tsc and the tests were happy; only `grep -P '[^\x00-\x7F]'` (with `LC_ALL=C.UTF-8`) showed it. Rule: any source that needs a `\u` escape gets it built in a scratch Python script from `chr(92) + 'u'`, then grep the file for non-ASCII.

## 2026-10-20 "Keep both sides" of a conflict hunk loses a shared closing line
When two branches add two different functions at the same spot, git puts the one `}` they share after the `>>>>>>>` marker. Keeping both sides gives two bodies and one brace: `node --check` caught it twice (update-core.js, signing-key.mjs). Rule: after a both-sides resolve, run `node --check` on the file before anything else.

## 2026-10-21 `npx asar extract-file` writes into the current folder, silently overwriting
Ran `npx asar extract-file app.asar package.json` from `desktop/` to read the installed app's version. It wrote the extracted file as `desktop/package.json`, replacing the real one (scripts, build config gone), with no message. The next `npm run dist` failed with "Missing script". Caught by `git status`. Rule: read inside an asar with `@electron/asar` `extractFile()` in a `node -e` (returns a buffer, writes nothing), or run `asar` from the scratchpad. Never run an extracting tool with cwd in the repo.

## 2026-10-22 Python edit script wrote `\'` as `'` inside a TS string, and the check ran before the edit
Wrote a changelog note with `someone\'s` through a `python -I -` heredoc; the file got a bare `'`, which broke the TS string and gave 314 typecheck errors. Caught only by release.sh's gate, after I had already said "typecheck clean" (the check ran before the changelog edit). Rules: no apostrophes in changelog notes (reword), and the typecheck is the last thing before commit, after every edit.

## 2026-10-22 The dev API (`tsx watch`) kept serving old code after new files were added
Added `server/src/routes/server-icon.ts` and migration 0036; typecheck and tests passed, but the running `npm run dev` API answered the new route with a 500 (the route was registered, the table was not there: the process had not restarted, so boot-time migrations never ran). Its log was not reachable either (started by an earlier session). Fix: kill the PID on 8787 and start `npm run dev:server` again with output to a scratchpad log. Rule: after adding a migration or a new route file, restart the dev API before trusting a shot or a manual call against it, and start dev servers with a log file I can read.

## 2026-10-22 release.sh gate failed on a Node native crash in one test file, not a test
`kicks-and-invites.test.ts` died with a V8 stack trace (no assertion) under the full `node --test` run; alone it passed, and the next full run passed. Looks like the pglite/WASM worker crashing under parallel test files. Rule: a gate failure with a `v8::` stack and no `AssertionError` is a rerun, not a bug hunt; if it repeats, run the server suite with `--test-concurrency=1`.

## 2026-10-22 imagegen "profile already in use" was another session's job, not a stale Chrome
`gen.py` failed with "Opening in existing browser session". The skill's recovery (kill every chrome.exe on `imagegen\profile`) was wrong here: a different Claude session was mid-run with `vid.py` (Rise video gen) on the same profile, and the kill took its browser down. Rule: before killing, check for a live owner with `Get-CimInstance Win32_Process | ? { $_.CommandLine -like '*imagegen*' -and $_.Name -eq 'python.exe' }`. If a `gen.py`/`vid.py` is running, wait for it; only kill Chrome when no python owner exists. (Same note belongs in the imagegen skill.)

## 2026-10-26 — backticks inside a double-quoted shell string ran a deploy script
Writing handoff text through `python -c "..."` inside Bash: every backtick-quoted path in the prose was treated as command substitution. Most just errored, but `bash scripts/publish-mac.sh` ran a second time (idempotent, same hashes, no harm). Rule: prose with backticks goes through a single-quoted heredoc (`<<'EOF'`) into a file, never inline in a double-quoted string.

- 2026-10-28: a ~3,300-word single-quoted heredoc (cat > docs/VISION.md <<'EOF') failed in the Bash tool with "unexpected EOF while looking for matching `''" at line 60, with no unbalanced quote in the body. Long prose heredocs are not reliable here; the Write tool took the same content first try. Rule: anything over a screen of prose goes through Write, not a heredoc.
