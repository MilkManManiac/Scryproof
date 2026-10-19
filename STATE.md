# STATE — Scryproof, Trey's side

**Updated:** 2026-10-19 16:15 CT. Our view of Wes's project: what we own, what is in flight, what needs Trey. Wes's own living state is `docs/HANDOFF.md` (he rewrites its top section every session); this file is ours and is not part of his workflow. Work items are beads (`bd ready`); the epic is "Mac app 0.5.8" (`Scryproof-skk`, step `Scryproof-skk.7` open).

## What we own

- The **Mac desktop app**: build, signing (Trey's Developer ID, team LRU27MC63Q, notary keychain profile `codex-pet-sidecar-notary`), notarization, the Mac shell update keys (everyday private key `~/.scryproof/mac-update-key.pem` on Trey's Mac; recovery private key in Trey's 1Password only; public halves in `desktop/src/update-key-mac.pub.pem` and `desktop/src/update-key-mac-recovery.pub.pem`). Wes owns Windows and the client signing key; Matt owns Linux.
- Reviews on request (`docs/reviews/`).

## Where things stand (branch `mac-0.5.8`, pushed to Forgejo origin; updated 2026-10-19)

- **Wes's GitHub main as of 10-14 is merged in** (per-app share sound on Windows, pop-out streams, watch from the name pop-up, 100 soundboard sounds). One conflict in the desktop permission handlers, both sides kept. The branch is 13 commits ahead of Wes's main and contains all of it. GitHub has no remote in this checkout: fetch with `git fetch https://github.com/MilkManManiac/Scryproof.git '+refs/heads/*:refs/remotes/gh/*'`.
- **Mac 0.5.9 is built, notarized, stapled, installed on Trey's Mac and running** (zip sha256 561cd472…, DMG 701b49b4…, manifest `desktop/release/installer-mac-arm64.json`). Every signing check and `scripts/publish-mac.sh --dry-run` pass. 0.5.9 because Wes's unreleased Windows build was also numbered 0.5.8. Detail: `docs/HANDOFF.md` under "Mac app 0.5.9".
- **Not yet tried by hand on 0.5.9:** pop a stream out, watch from a name pop-up, a call. Earlier unchecked items still open: Activities → Pass-along → Record consent dialog; a real call with Wes or Matt.
- **The GitHub repo is public** as of 2026-10-19 (GAMEPLAN says private until Wes decides otherwise); flagged to Trey, not acted on.

## What needs Trey

1. The hands-on checks above.
2. Publishing (`bash scripts/publish-mac.sh`) on Wes's word, from a machine with `.env.box` and the box key (Wes's PC or Matt; not this Mac). Then launch the kept 0.5.5 copy at `desktop/release/mac-arm64-0.5.5-kept/Scryproof.app` and watch it update to 0.5.9.
3. Getting this branch to Wes (mic fallback, Mac work, and the merge): a GitHub push or PR is gated on Trey's word. Until then, Wes's next client release from his main would drop the microphone fallback from Mac and Windows apps alike.

## Held / parked

- Wes parked the box reboot and the two files with no off-PC copy (SSH key, LUKS header); the LUKS header is the one loss that breaks "movable by restore + DNS change".
- App audio per program is Windows-only; Intel Macs get no build (arm64 only by ruling).
- The bead `Scryproof-skk.7` is still claimed by the dead devbox session (`bd` refused the takeover); progress lives in its comments.
