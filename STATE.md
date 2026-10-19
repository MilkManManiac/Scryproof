# STATE — Scryproof, Trey's side

**Updated:** 2026-10-19 17:35 CT. Our view of Wes's project: what we own, what is in flight, what needs Trey. Wes's own living state is `docs/HANDOFF.md` (he rewrites its top section every session); this file is ours and is not part of his workflow. Work items are beads (`bd ready`); the epic is `Scryproof-skk` (titled 0.5.8, now carrying 0.5.9), step `Scryproof-skk.7` open.

## What we own

- The **Mac desktop app**: build, signing (Trey's Developer ID, team LRU27MC63Q, notary keychain profile `codex-pet-sidecar-notary`), notarization, the Mac shell update keys (everyday private key `~/.scryproof/mac-update-key.pem` on Trey's Mac; recovery private key in Trey's 1Password only; public halves in `desktop/src/update-key-mac.pub.pem` and `desktop/src/update-key-mac-recovery.pub.pem`). Wes owns Windows and the client signing key; Matt owns Linux.
- Reviews on request (`docs/reviews/`).

## Where things stand (branch `mac-0.5.8` on Forgejo origin = `mac-0.5.9` on GitHub; 2026-10-19)

- **Mac 0.5.9 is built, notarized, stapled, installed on Trey's Mac and running.** It carries Wes's GitHub main as of 10-14 plus our Mac work and the microphone fallback. Zip sha256 561cd472…, DMG 701b49b4…, manifest `desktop/release/installer-mac-arm64.json`; every signing check and `scripts/publish-mac.sh --dry-run` pass. Detail: `docs/HANDOFF.md` under "Mac app 0.5.9".
- **PR #10 is open into Wes's main** (https://github.com/MilkManManiac/Scryproof/pull/10, mergeable), pushed at Trey's word 2026-10-19. Waiting on Wes to merge.
- **Not published.** Trey 2026-10-19: publishing is Wes's call (bd memory `trey-ruling-2026-10-19-publish-and-public`). It needs `.env.box` and the box key, which are on Wes's PC or Matt's, not this Mac.
- GitHub has no remote in this checkout: fetch with `git fetch https://github.com/MilkManManiac/Scryproof.git '+refs/heads/*:refs/remotes/gh/*'`. The repo being public is Wes's choice (same ruling); not ours to raise.

## What needs Trey

1. Hand checks on 0.5.9, when he next tests (he will say): pop a stream out, "Watch stream" from a name pop-up, a call. Older open item: Activities → Pass-along → Record shows the consent dialog once.
2. After Wes publishes: launch the kept 0.5.5 copy at `desktop/release/mac-arm64-0.5.5-kept/Scryproof.app` and watch it update to 0.5.9.

## Held / parked

- **Agent channel (members connect their AI agents to one channel): spec approved 2026-10-19, build held by Trey** until a large Loom update lands; this build will dogfood it. Spec `docs/agent-channel-spec.md` (draft 3), epic `Scryproof-bbf`, deferred voice-agents idea `Scryproof-bbf.1`. On go: phase beads from spec section 7, then phase 1.

- Wes parked the box reboot and the two files with no off-PC copy (SSH key, LUKS header); the LUKS header is the one loss that breaks "movable by restore + DNS change".
- App audio per program is Windows-only; Intel Macs get no build (arm64 only by ruling).
- The bead `Scryproof-skk.7` is still claimed by the dead devbox session (`bd` refused the takeover); progress lives in its comments.
- Cross-machine coordination: Helm (Loom on the devbox, `~/Code/hq`) takes status notes at `participant:loom-048a697c@trey`.
