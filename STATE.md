# STATE — Scryproof, Trey's side

**Updated:** 2026-10-26 16:30 CT. Our view of Wes's project: what we own, what is in flight, what needs Trey. Wes's living state is `docs/HANDOFF.md`; our two sections sit at its top. Work items are beads (`bd ready`): Mac epic `Scryproof-skk` (step `Scryproof-skk.7`), agent channel epic `Scryproof-bbf`.

## What we own

- The **Mac desktop app**: build, signing (Developer ID team LRU27MC63Q, notary keychain profile `codex-pet-sidecar-notary`), notarization, the Mac shell update keys (everyday private key `~/.scryproof/mac-update-key.pem`; recovery private key in Trey's 1Password; public halves in `desktop/src/`). Wes owns Windows and the client signing key, and publishes from his PC; Matt owns Linux.

## Now

- **Mac 0.5.10 with sound on the Mac: ready for the second call with Wes (2026-10-26).** Window, whole-screen and music sharing with sound, call left out, plus the "Invalid capture constraints" fix. Real encrypted-call check passes (0 failures, red-proofed), also with the signed helper; full gate green; notarized; installed on Trey's Mac; folder `desktop/release/Mac 0.5.10 for Wes/`. Next: the call with Wes, then Wes publishes and the one-file GitHub PR. Detail: `docs/HANDOFF.md`, "Mac audio 0.5.10".
- **Mac 0.5.9 from main: verified and call-tested 2026-10-26** (everything passed; Wes's Windows share with sound has no echo), superseded by 0.5.10. Not published: publishing and the one-file GitHub PR from branch `mac-publish-from-windows` wait for the second call (ruling `trey-ruling-2026-10-26-mac-059-github-hold`). Detail: `docs/HANDOFF.md`, "Mac app from main".
- **After that: the agent channel build.** Branch `agent-channel` (Forgejo). First step: build graph from `docs/agent-channel-spec.md` section 7 per `~/.claude-shared/reference/build-plan-template.md`, then phase 1. Detail: `docs/HANDOFF.md`, "Agent channel".

## What needs Trey

1. The second call test with Wes, when the sound build is ready (I will say so).
2. macOS permission prompts for system audio recording, if the build needs a click.
3. After the call: go for the GitHub PR and publishing.

## Held / parked

- Wes's idea of a GitHub Actions Mac runner holding Trey's signing cert and notary login as repo secrets: not decided. Our view: don't put Trey's personal Developer ID in that repo; a self-hosted runner on Trey's Mac or Wes's own Apple account are the alternatives.
- Box reboot and the two files with no off-PC copy (SSH key, LUKS header): parked by Wes.
- App audio per program is Windows-only; Intel Macs get no build (arm64 only by ruling).
- Repo visibility and publishing are Wes's calls (ruling `trey-ruling-2026-10-19-publish-and-public`). GitHub has no remote here: fetch with `git fetch https://github.com/MilkManManiac/Scryproof.git '+refs/heads/*:refs/remotes/gh/*'`.
- Cross-machine coordination: Helm (Loom on the devbox, `~/Code/hq`) at `participant:loom-048a697c@trey`.
