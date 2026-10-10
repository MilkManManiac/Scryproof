# Build order: audit fixes (from docs/AUDIT-2026-10-10.md)

Wes, 2026-10-10: "lets do a great audit on this system. see what we can improve in all aspects." Then: "put it a build order. im gonna clear context and continue."

## Read first

1. `CLAUDE.md` (non-negotiables, one command at a time for Wes, no deploy without his word each time).
2. `docs/AUDIT-2026-10-10.md`: the numbered findings this order refers to. Each phase names its numbers.
3. `docs/HANDOFF.md` top block: what is live and what is built but not published (round eight of Pass-along is built, not published).
4. `PAPERCUTS.md`: heredocs with apostrophes break in the Bash tool, write patch files with the Write tool; no temp worktrees.

## Ground rules

- Branch: work on `main`, small commits, plain messages, push after each phase.
- Every phase ends runnable with its one check passed. Checks are sized to the change: one quick check per phase, the full suite once at the end of each round.
- Nothing touches the box, publishes a page, releases a client or builds an installer until Wes says so for that specific step. Say what the step would do, then wait.
- The store and page changes in round one go out together with Pass-along round eight (one publish) when he says "deploy".
- Stop rule: if a phase needs a design decision not covered here, do every other phase first, then ask in one line.

## Round one: data loss and privacy, no app release

**Phase 1. Pass-along store hardening** (findings 7, 8, 16, 9 of the store side). File: `docs/spikes/store/store.mjs`.
- Count files on disk for the loop cap, not the trimmed list.
- Cap a loop's total file size (4 MB); a PUT that would exceed it answers 413 with a plain message.
- Keep clips out of `list()` reads: read only the fields the list needs, or hold a small index in memory refreshed on write.
- Await the body first, then read, check, mutate, write with no await in between.
- Strip `<>&"'` in `clean()` as well as the page-side escape (phase 2).
- Constant-time key compare.
- Check: a node script that POSTs 60 loops and sees 429 at the cap, PUTs a 5 MB layer and sees 413, and fires 20 concurrent presence POSTs during a layer PUT without losing the layer.

**Phase 2. Pass-along page leaks** (18, 19, 16, 17). File: `docs/spikes/passalong.js`.
- `esc()` on every name rendered with innerHTML.
- On Leave and on Drop while `p.arm` is set: stop stream tracks, clear the meter interval, null `p.arm`.
- In `unplumb`: `p.inst?.destroy()`, `p.rack?.destroy()`, `p.input?.disconnect()`, and keep the per-layer limiter on `l` so it is disconnected too.
- Poll with `If-None-Match` on `updated + working` (store answers 304); clips only travel when something changed.
- Check: the existing `loops7.py` and `vocals.py` headless runs still pass locally; a Leave during "waiting" leaves no live mic track (assert `stream.active === false` via a page hook or the status line).

**Phase 3. Box: vault and gating** (1, 2, 10). Files: `infra/box/remote/*`, `docs/spikes/store/pass-along-store.service`, `infra/activities/provision.sh`, `scripts/activities/publish-pass-along.sh`.
- Script the move of `/var/lib/pass-along-store` into the vault with `20-vault-adopt.sh` and the gating of `pass-along-store`, `scryproof-activities` and `hero-line-relay` with `30-gate-services.sh`; `systemctl disable` the three; replace the vacuous `RequiresMountsFor=/srv/sites` with the flag assert the main app uses.
- `PermitRootLogin prohibit-password`; add `fail2ban-client status sshd` to `00-facts.sh`.
- Running these on the box is a deploy: needs his word. Each is one `bash scripts/box.sh <script>` for Wes, one at a time.
- Check: `00-facts.sh` after shows the three units gated and the store directory under the vault; a reboot test (his call) stays locked.

**Phase 4. Backups carry the env** (3, 4). Files: `infra/box/remote/70-backups.sh` (the `scryproof-backup` script), `scripts/backup-check.mjs`, new `docs/box/if-the-pc-dies.md`, `scripts/ship.sh`.
- Add the vault `.env` and `livekit.yaml` to the backup tar; `backup-check.mjs` asserts both are present.
- Commit `~/ship.sh` from WSL as `scripts/ship.sh` (it holds no secret; check before committing) and point `release.sh` at it.
- Write `docs/box/if-the-pc-dies.md`: each private file (SSH key, update key, backup key, LUKS header, `.env.box`, `infra/secrets/.env.gpg`) and where its second copy is, verified. Anything with no second copy is listed as a to-do for Wes, with the one command to make it.
- Check: `npm run test:backup` equivalent (`backup-check.mjs`) passes on a fresh pull once the box runs the new backup (his word).

**Phase 5. Server: revoke closes sockets, limiters** (5, 14, 13, 12). Files: `server/src/services/auth.ts`, `server/src/gateway/index.ts`, `server/src/gateway/hub.ts`, `server/src/routes/auth.ts`, `server/src/routes/attachments.ts`, `server/src/routes/profile.ts`.
- `revokeSession` / `revokeAllSessions` close matching sockets with 4001 through the hub.
- Login limiter keyed on `username.trim().toLowerCase()`.
- One `consume()` per socket at the top of `handleClientEvent`.
- Per-user limiter on channel attachment and avatar uploads plus an unclaimed-bytes ceiling.
- Check: one server test per change (revoke closes the socket; padded username shares the bucket; 100 typing frames get cut; 11th upload in a minute is 429).

**Phase 6. Client: never blank** (6, 21). Files: `web/src/main.tsx`, `web/src/state/store.tsx`, `web/src/lib/api.ts`, `web/src/components/AuthScreen.tsx`, `web/src/App.tsx`.
- Class error boundary around `<App/>` with a plain "Something broke. Reload." and a Reload button.
- `applyGatewayEvent` wrapped so a throw returns the previous state; the event queue gets `.catch(() => undefined)`.
- API 401 goes through the same sign-out path as close 4001, with a one-line reason on the sign-in screen ("You were signed out. Sign in again.").
- Check: a web test that feeds a malformed `ready` frame and asserts the next frame still renders; typecheck clean.

**Phase 7. Release gate** (9). File: `scripts/release.sh`.
- `npm run typecheck && npm test` before the sign step; abort on failure.
- Check: a deliberate failing test makes `release.sh` stop before signing (dry run against a throwaway commit, then revert).

**Round one close:** full suite (server, web, desktop on Windows), HANDOFF top block updated, changelog entry dated the day it ships ("Signing out now signs out everywhere" is the user-facing line). Then wait for his word to: publish Pass-along (round eight plus phases 1 and 2), run the box scripts (phases 3 and 4), release the client (phases 5 to 7).

## Round two: operations and robustness

**Phase 8. Monitoring** (11). `OnFailure=` on `scryproof-backup.service` writing a flag the app's `/api/health` reports; `backup-pull.sh` plus `backup-check.mjs` as a weekly scheduled task on this PC (ask Wes before creating the task); a disk-space line in `/api/health` when the vault is under 1 GB. Check: health shows the flag when the backup unit is failed on purpose (his word for the box).

**Phase 9. Gateway recovery** (20). `online`, `visibilitychange` and `pageshow` reset the backoff and reconnect; heartbeat gets an ack deadline. Check: web test with fake timers.

**Phase 10. Repo size and docs** (30, 31, 32, 33, 36). `release.sh` uploads `client.bin` to the box instead of committing it (keep `client.json`); HANDOFF becomes one 30-line "Pick up here" plus `docs/HISTORY.md`; GAMEPLAN section 0 becomes one paragraph pointing at HANDOFF; dead docs to `docs/archive/` with an index; `docs/LIVE.md` written by the release and publish scripts. Do not rewrite git history without his word. Check: `git count-objects` stops growing per release; a fresh model can state what is live from HANDOFF in under a minute.

**Phase 11. Small server items** (37 server part): invite preview limiter, first-run registration race, push upsert refuses another user's endpoint, `.max(32)` on mask strings. One test each.

**Phase 12. Outbound 443 proof** (28). Log outbound 443 on the box for a day, list every destination, record it in `docs/box/`. Needs his word.

## Round three: performance and desktop

**Phase 13. Client bundle** (22). `React.lazy` the eight game gates and the three scenes, dynamic import of emoji data from the picker, `manualChunks` for livekit. Check: main chunk under 800 kB, every lazy screen still opens in the headless run.

**Phase 14. Re-render hot spot** (23). `memo(MessageRow)` with a message-identity comparator, or presence/typing/voice in their own contexts. Check: a profiler count of MessageRow renders on a presence event drops to zero.

**Phase 15. Desktop** (15, 24, 25, 26, plus the low items 5 and 8 of the desktop review): visible one-time mic consent for the activities frame per session; DMG hash in the signed Mac manifest and checked in-app; drop the two Mac entitlements (Trey rebuilds and checks mic, camera, push-to-talk); second recovery signing keypair generated offline and baked in; streamed client download with a byte cap; `win.reload()` once on renderer crash. This is an installer (0.5.8), to be combined with `docs/SPEC-app-audio.md` if that is ready. Needs his word to build, sign and publish.

**Phase 16. Restore rehearsal** (27). On a throwaway droplet (costs money for an hour: ask first), restore from the latest backup, time it, write the steps and the time into `infra/box/README.md`, destroy the droplet.

**Phase 17. Tests for untested security paths** (29). One hostile-input test each for server `totp`, `channel-keys`, `audit`, `livekit`, `serialize`; web `permissionMeta`, `gateway`, `push`, `usePermissions`; desktop `main.js` protocol path check and navigation guards (extract to a `-core.js` to test).

## Summary to write at the end of each round

Five plain lines in HANDOFF: what shipped, what is waiting on Wes, what was proven and how, what was not proven, what is next.
