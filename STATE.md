# STATE — Scryproof, Trey's side

**Updated:** 2026-10-26 15:50 CT. Our view of Wes's project: what we own, what is in flight, what needs Trey. Wes's own living state is `docs/HANDOFF.md` (he rewrites its top section every session); this file is ours and is not part of his workflow. Work items are beads (`bd ready`); the epic is `Scryproof-skk` (titled 0.5.8, now carrying 0.5.9), step `Scryproof-skk.7` open.

## What we own

- The **Mac desktop app**: build, signing (Trey's Developer ID, team LRU27MC63Q, notary keychain profile `codex-pet-sidecar-notary`), notarization, the Mac shell update keys (everyday private key `~/.scryproof/mac-update-key.pem` on Trey's Mac; recovery private key in Trey's 1Password only; public halves in `desktop/src/update-key-mac.pub.pem` and `desktop/src/update-key-mac-recovery.pub.pem`). Wes owns Windows and the client signing key; Matt owns Linux.
- Reviews on request (`docs/reviews/`).

## Where things stand (2026-10-26; Wes's GitHub main as of 10-25 merged into `mac-0.5.8` on Forgejo)

- **PR #10 merged by Wes on 10-20** (his commit 6326b15). Wes released Windows 0.5.9 on 10-21 and the live client is 1792968983494 (10-25). `main` here and on Forgejo now equals GitHub main.
- **No Mac build has ever been published to the box.** The Mac button on /download 404s for every Mac user (Wes found this 10-23).
- **Our notarized Mac 0.5.9 (10-19) is stale:** it predates Wes's fix for the main-process crash when a popped-out stream closes (`main.js` `did-create-window`, shared code, so Macs crash too). Wes's rule (10-22): Trey runs `npm run dist:mac` from `main`, sends the three files (zip, DMG, `installer-mac-arm64.json`), and Wes runs `scripts/publish-mac.sh` on his PC on his own yes. Desktop version on main is still 0.5.9, matching the published Windows build.
- Wes also floated a GitHub Actions Mac runner that builds and notarizes from main, with Trey's signing cert and notary login as repo secrets. Not decided; Trey's call.
- GitHub has no remote in this checkout: fetch with `git fetch https://github.com/MilkManManiac/Scryproof.git '+refs/heads/*:refs/remotes/gh/*'`. The repo being public is Wes's choice (ruling 2026-10-19); not ours to raise.

## What needs Trey

1. Rebuild Mac 0.5.9 from current `main`, notarize, and send the three files to Wes (or decide on the Actions runner instead).
2. Hand checks on the rebuilt app: pop a stream out and close it (the crash fix), "Watch stream" from a name pop-up, a call. Older open item: Activities → Pass-along → Record shows the consent dialog once.
3. After Wes publishes: launch the kept 0.5.5 copy at `desktop/release/mac-arm64-0.5.5-kept/Scryproof.app` and watch it update.

## Held / parked

- **Agent channel (members connect their AI agents to one channel): spec approved 2026-10-19, build held by Trey** until a large Loom update lands; this build will dogfood it. As of 10-26 Loom is at 0.6.4 with Post channel integration merged 10-23; waiting on Trey's go. Spec `docs/agent-channel-spec.md` (draft 3), epic `Scryproof-bbf`, deferred voice-agents idea `Scryproof-bbf.1`. On go: phase beads from spec section 7, then phase 1.

- Wes parked the box reboot and the two files with no off-PC copy (SSH key, LUKS header); the LUKS header is the one loss that breaks "movable by restore + DNS change".
- App audio per program is Windows-only; Intel Macs get no build (arm64 only by ruling).
- The bead `Scryproof-skk.7` is still claimed by the dead devbox session (`bd` refused the takeover); progress lives in its comments.
- Cross-machine coordination: Helm (Loom on the devbox, `~/Code/hq`) takes status notes at `participant:loom-048a697c@trey`.
