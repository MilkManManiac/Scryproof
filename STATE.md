# STATE — Scryproof, Trey's side

**Updated:** 2026-10-10 15:05 ET. Our view of Wes's project: what we own, what is in flight, what needs Trey. Wes's own living state is `docs/HANDOFF.md` (he rewrites its top section every session); this file is ours and is not part of his workflow. Work items are beads (`bd ready`); the epic is "Mac app 0.5.8" (`Scryproof-skk`, step `Scryproof-skk.7` open).

## What we own

- The **Mac desktop app**: build, signing (Trey's Developer ID, team LRU27MC63Q, notary keychain profile `codex-pet-sidecar-notary`), notarization, the Mac shell update keys (everyday private key `~/.scryproof/mac-update-key.pem` on Trey's Mac; recovery private key in Trey's 1Password only; public halves in `desktop/src/update-key-mac.pub.pem` and `desktop/src/update-key-mac-recovery.pub.pem`). Wes owns Windows and the client signing key; Matt owns Linux.
- Reviews on request (`docs/reviews/`).

## Where things stand (branch `mac-0.5.8`, level with Forgejo origin, 5 commits past Wes's `main`)

- **0.5.8 is built, notarized, stapled, installed on Trey's Mac and running** (zip sha256 feee1763…, DMG 82ae9d5e…, manifest `desktop/release/installer-mac-arm64.json`; every signing check and `scripts/publish-mac.sh --dry-run` pass; tightened entitlements shipped). Not published, not merged to main.
- **Voice-join bug found and fixed here (commit 0ef5c0f, shared client code):** a saved microphone whose device id the browser no longer knows made every join hang itself up with a blank reason. Calls now fall back to the default mic, clear the stale choice and say so; mic errors carry words. Trey confirmed a join holds on the rebuilt app. Detail: `docs/HANDOFF.md` under "Mac app 0.5.8".
- **Checked by Trey:** launch, keychain (no prompt is correct: same signature as before), join stays in, push-to-talk (Slash) with Scryproof in front and with another app in front.
- **Second finding, fixed 2026-10-10 15:15 ET:** push-to-talk was dead because macOS held a stale Accessibility grant from an earlier build (switch showed on, app refused). Cleared with `tccutil reset`, relaunched, granted fresh. Commit e7c5f8f makes both permission notices say what to do when the switch is already on. Detail in `docs/HANDOFF.md`.
- **Not yet checked, needs Trey at the Mac:** camera; Activities → Pass-along → Record shows the consent dialog once; a real call with Wes or Matt.

## What needs Trey

1. The hands-on checks above.
2. Publishing (`bash scripts/publish-mac.sh`) on Wes's word; then launch the kept 0.5.5 copy at `desktop/release/mac-arm64-0.5.5-kept/Scryproof.app` and watch it update to 0.5.8; a copy run from the DMG or a read-only folder gets the checked DMG opened for it.
3. Getting commit 0ef5c0f (and the rest of this branch) to Wes: a GitHub push or PR is gated on Trey's word.

## Held / parked

- Wes parked the box reboot and the two files with no off-PC copy (SSH key, LUKS header); the LUKS header is the one loss that breaks "movable by restore + DNS change".
- App audio per program is Windows-only; Intel Macs get no build (arm64 only by ruling).
- The bead `Scryproof-skk.7` is still claimed by the dead devbox session (`bd` refused the takeover); progress lives in its comments.
