# STATE — Scryproof, Trey's side

**Updated:** 2026-10-10 afternoon. Our view of Wes's project: what we own, what is in flight, what needs Trey. Wes's own living state is `docs/HANDOFF.md` (he rewrites its top section every session); this file is ours and is not part of his workflow. Work items are beads (`bd ready`); the epic is "Mac app 0.5.8".

## What we own

- The **Mac desktop app**: build, signing (Trey's Developer ID, team LRU27MC63Q), notarization, the Mac shell update key (`~/.scryproof/mac-update-key.pem` on Trey's Mac, public half in `desktop/src/update-key-mac.pub.pem`). Wes owns Windows and the client signing key; Matt owns Linux.
- Reviews on request (E2EE, hostile-server, desktop port assessment in `docs/reviews/`).

## Where things stand

- **Wes's main is current here.** Local `main` = GitHub `upstream/main` = Forgejo `origin/main` at "Handoff: audit round one live, client 1791618424884" (2026-10-10). Our old `spike/mac-desktop` work is fully inside it.
- **Branch `mac-0.5.8`** (from that main): the Mac app brought up to current main plus the round-three desktop fixes from `docs/SPEC-audit-fixes.md` phase 15. Code and unit tests done on the devbox: Activities game frames get a visible one-time microphone consent dialog instead of a silent grant; the Mac "download the DMG" fallback now fetches the DMG in-app and checks it against a hash signed in the manifest before opening it; every update reader accepts a second (recovery) signing key, with `npm run mac-update-key -- --recovery` to make one; the client update download is byte-capped while streaming; a crashed page reloads once; the two over-wide Mac entitlements are dropped; Electron 44.4.3 → 44.5.1 (44.7.0 is younger than the 7-day install gate until 2026-10-14); version 0.5.8; the notary keychain profile name comes from `APPLE_KEYCHAIN_PROFILE`.
- **Proven on the devbox:** desktop unit suite 140/140 under xvfb (was 135 with 47 Mac skips on Windows); each new check broken once and seen to fail; the app's main process boots under xvfb with the new wiring; an Electron experiment showed the permission *request* handler runs before the sync *check* handler on a frame mic request, so the dialog cannot be blocked by the check.
- **Not proven, Mac only:** that the app launches, gets mic/camera and push-to-talk with the tightened entitlements (if not: put `disable-library-validation` back first); the consent dialog in Pass-along; a real call; a 0.5.5 → 0.5.8 self-update; the DMG path on a translocated copy.

## What needs Trey (the Mac)

1. On the Mac, from the repo: `git fetch origin && git checkout mac-0.5.8`, `npm ci && npm ci --prefix desktop` (then `node desktop/node_modules/electron/install.js` if `desktop/node_modules/electron/dist` is missing: install scripts are off).
2. `npm run mac-update-key --prefix desktop -- --recovery`: commit the public file it writes, put the private half in the password manager, delete the file.
3. `APPLE_KEYCHAIN_PROFILE=codex-pet-sidecar-notary npm run dist:mac --prefix desktop`, then the codesign/stapler/spctl checks listed under "Mac release" in `docs/HANDOFF.md`, then `bash scripts/publish-mac.sh --dry-run`.
4. Install the DMG over `/Applications/Scryproof.app`, launch, run the Mac checklist in HANDOFF ("Mac app 0.5.8").
5. Publishing (`bash scripts/publish-mac.sh`) and merging to Wes's main are on Wes's word; a GitHub push is gated on Trey's.

## Held / parked

- Wes parked the box reboot (new kernel, 44 packages) and the two files with no off-PC copy (SSH key, LUKS header). Worth pushing on the LUKS header: it is the one loss that breaks "movable by restore + DNS change".
- App audio per program (`docs/SPEC-app-audio.md`) is Windows-only; macOS 14.2+ has a per-process audio tap API, not specced.
- Intel Macs: no build, no updates (arm64 only by ruling).

## Conventions here

- `origin` is Forgejo (push freely); `upstream` is Wes's GitHub (fetch only; the push URL is disabled). Our changes reach Wes as a GitHub PR from a branch, on Trey's word.
- Beads live in `.beads/` (Dolt, maintainer role: `git config beads.role maintainer`, else the store is read-only). `.claude/`, `.codex/`, `.cursor/`, `AGENTS.md` that `bd init` writes are not kept.
- Desktop tests: `cd desktop && xvfb-run -a node --test test/*.test.mjs` (push-to-talk needs a display). Voice harness notes are in HANDOFF "Gate at merge".
