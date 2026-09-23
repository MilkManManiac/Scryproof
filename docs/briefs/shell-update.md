# The app updates its own shell, and the Electron fuses

Read `docs/briefs/README.md` first. Opus. Written 2026-09-23 (BUILD-ORDER
item 13). The main session tests the full cycle on Wes's PC after merge
(install an old build, publish a newer one, watch it update); you do not
run installers.

## Why

The client (the web code) already updates itself: `desktop/src/update-core.js`
and "updates" in `desktop/src/main.js`, signed with Wes's Ed25519 key, public
half `desktop/src/update-key.pub.pem`. Read `docs/HANDOFF.md`, section
"Desktop app updates itself", before anything. The shell (`desktop/src/*`,
the Electron version) still needs everyone to run a new installer by hand.
Batch four made the group do that tonight. The installer that carries this
work should be the last one anybody runs by hand.

## The job, part 1: signed installers

No electron-updater, no update service, no new dependency. Same shape as
the client update, same key:

- A script (next to `desktop/scripts/make-update.mjs`, sharing its key
  loading) writes `installer.json` beside the built installer in
  `desktop/release/`: version, sha256, size, and an Ed25519 signature. Sign
  a message with its own prefix (e.g. `scryproof-installer\n` + version +
  hash) so a client signature can never be passed off as an installer one,
  or the reverse. Hook it into `npm run dist`.
- `scripts/publish-installer.sh` sends `installer.json` along with the exe;
  `server/src/routes/downloads.ts` serves it (add it to the list, JSON, no
  cache). Check the served copy matches, as the script already does for
  the exe.
- The app checks `installer.json` at start and every hour. When its
  version is newer than `app.getVersion()` (compare properly, 0.10 > 0.9),
  it downloads the exe to `userData`, verifies size, hash and signature
  (verify in a module with no Electron in it, like `update-core.js`, so it
  is testable), and only then tells the page. Anything that fails a check
  is deleted and never run. Never run an installer that is not newer.
- The page shows the same kind of banner the client update does ("A new
  version of the app is ready. Restart to install", and in a call "when
  your call is over"). Look at how the client banner is driven over
  `preload.cjs` and reuse it; if both are ready, the installer wins, since
  it carries its own client.
- Restart: spawn the verified installer detached with `/S --force-run`
  (NSIS oneClick upgrades in place silently; `--force-run` relaunches the
  app when it is done), then quit. The login lives in `userData`, which
  the installer does not touch.

## The job, part 2: fuses

electron-builder 26 has an `electronFuses` build option; use it, no new
package. RunAsNode off, EnableNodeOptionsEnvironmentVariable off,
EnableNodeCliInspectArguments off, EnableCookieEncryption on,
EnableEmbeddedAsarIntegrityValidation on, OnlyLoadAppFromAsar on. Check
first that the app is packed as an asar and that nothing in main.js
(push-to-talk's native module, `uiohook-napi`, the client under
`resources/client`) breaks under OnlyLoadAppFromAsar / integrity; if one
of them would, leave that fuse off and say why.

**Cookie encryption and the saved login.** Find out, from Electron's and
Chromium's docs or source, whether turning it on keeps existing plaintext
cookies readable or signs everyone out once. Report the answer with the
source. Do not guess; Wes has to be told before it ships.

## Tests

`desktop/test/`: a forged installer signature, a changed byte, a client
signature presented as an installer one, an older or equal version, a
size mismatch. `npm test` in `desktop/` plus the three commands in the
README.

## Not the job

Code signing with a paid certificate (money, Wes's call). Mac or Linux.
Rolling back.
