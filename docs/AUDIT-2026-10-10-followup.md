# Audit follow-up, 2026-10-10 (late)

Wes: "do a massive audit on all systems and make sure all is in order and if things could be improved. This retains to all things. Fan out as needed."

Yesterday's audit (`AUDIT-2026-10-10.md`) read the code only. This pass did three things: looked at the live box, audited the areas yesterday skipped, and built round one of `SPEC-audit-fixes.md`. Nothing was deployed, published or released.

## The live box, read-only

Checked over SSH at 07:00 UTC with `00-facts.sh` plus a health sweep.

- Up 18 days, load 0.08, no failed units. Vault open, 4.3 GB of 10 free. Root disk 19 GB free.
- Backups: nightly, newest 2026-10-09 08:08, 200 MB each, seven kept. Last pull to this PC was 2026-09-23.
- Certificates: scryproof.com to 2026-12-20, activities to 2026-12-31. certbot timer active.
- Memory: 961 MB total, 435 MB free, 162 MB of the vault swapfile in use. The API is the biggest process at 128 MB. Tight but fine.
- SSH: 606 failed logins in the last day, 4858 total, fail2ban has banned 314 addresses. `PermitRootLogin yes` (phase 3 fixes it). Every accepted login in 48 h is Wes's key from his home address.
- **Updates: 44 packages waiting and the box wants a reboot** (kernel 6.8.0-146 installed, 6.8.0-124 running). Security updates install themselves; the rest and the reboot are manual. A reboot leaves the vault locked until Wes runs `bash scripts/unlock.sh`.
- Journal errors in 24 h: only a harmless PAM `pam_lastlog.so` warning on every SSH login (Ubuntu 24.04 removed the module). No app errors.
- The Pass-along store holds 4 loops, 24 KB, on the root disk (phase 3 moves it into the vault).
- Postgres is 7.5 MB.
- `https://scryproof.com/api/health` answers 200 in 0.1 s.

## New findings (not in yesterday's list)

Ranked. CONFIRMED means read or run; PLAUSIBLE means reasoned.

1. **MEDIUM, PLAUSIBLE. The router nginx has no websocket timeouts.** `docs/bonesdeploy-fixes.patch` sets Upgrade headers and body size but no `proxy_read_timeout`/`proxy_send_timeout`, so nginx's 60 s default applies in front of the site layer's 75 s. The server never pings; a hidden tab whose heartbeat Chrome throttles to once a minute goes quiet for about 60 s and the router cuts it. This is the symptom the 60 to 100 s heartbeat change in HANDOFF was meant to fix, and that change only moved the server's own sweep. Fix: `ws.ping()` from the server every 30 s (browsers pong without a timer) plus `proxy_read_timeout 120s; proxy_send_timeout 120s;` in the router patch. To confirm on the box: `nginx -T | grep proxy_read_timeout`.
2. **LOW, CONFIRMED. Push topic links a person's devices.** `server/src/lib/web-push.ts` `topicFor` is sha256 of the conversation id, the same string for every device. Apple and Google can see two phones pinged with one topic at the same moments. Hash `conversationId + subscription.id` instead; coalescing is per subscription anyway.
3. **LOW, CONFIRMED. LiveKit data channel is not E2EE and everyone can publish on it.** `services/livekit.ts` grants `canPublishData` to every token; the only use is the music-audience message (metadata). Note it so nobody puts keys or chat on that channel thinking "Encrypted" covers it.
4. **LOW, CONFIRMED. The display name is in the LiveKit JWT** (`livekit.ts` sets `name`). The yaml comment says LiveKit sees only opaque ids. Drop `name`; the client already knows names from the gateway.
5. **LOW, CONFIRMED. Google Fonts preconnect in bonesdeploy's own placeholder page** (`infra/.framework/.../index.html.j2`). Only served if the site is ever reset before a deploy. Scryproof's placeholder and `web/index.html` load nothing external.
6. **Server, from the phase 5 builder:** `/api/auth/password` has no limiter on the current-password check, so a signed-in attacker can brute-force it; `/api/invites/:code/accept` is unlimited once signed in; gateway and voice limiters key on connection id so a reconnect resets the bucket.
7. **Web, from the phase 6 builder:** ten `fetch()` calls in `api.ts` (uploads) and the ones in `desktop.ts` bypass `request()`, so a 401 there does not reach the new sign-out path; `decodeServerEvent` only checks `t`, never `d`; the error boundary covers render throws only, not async ones.
8. **Infra, from the phase 3 builder:** `certbot.timer` is gated, so a box left locked for weeks does not renew; WSL `infra/secrets/.env.gpg` is encrypted to a key nobody holds (delete or re-encrypt); Hero Line's `deploy/install.sh` re-enables `hero-line-relay` on every publish; nothing schedules `backup-pull.sh`.
9. **Store, from the phase 1 builder (fixed):** an oversized upload used to reset the socket instead of answering 413, so the page showed "fetch failed".

## Checked and fine

- Git history, all 571 commits on every ref: no private key, VAPID, session secret, database URL or passphrase was ever committed. Every hit is a placeholder, a public key, a checksum pin or the dev seed password.
- Permissions: masks parsed from digit strings, role and overwrite edits checked against the actor's ceiling, hierarchy enforced, voice tokens zeroed without VIEW_CHANNEL. Client only hides buttons.
- Site nginx: CSP has no third-party host, HSTS, frame-ancestors none, access log off. Activities router strips Cookie and Authorization, rate and connection limits in place.
- LiveKit: signalling bound to loopback, no external IP service, embedded TURN, no webhooks or telemetry, E2EE on before connect, per-user keys made in the browser and non-extractable, browsers without frame transforms refused. No server-side key exists.
- Push: VAPID made on the box into the vault, relay allowlist https only, empty ping bodies.
- Dependencies: nothing pinned at a version with an advisory. Electron 44.4.3 is three patch releases behind 44.7.0 (Chromium backports): bump with the next installer. Majors waiting with no security reason: vite 8, plugin-react 6, fastify/multipart 10, TypeScript 7.
- GitHub: PR #8 is fully in main (merged as 792b9d5; open only because its base was `mac-desktop`). 13 of 14 remote branches are merged into main; `activity-fullscreen` (Wes, 2026-10-08) is superseded by main and would regress if merged. All 14 can be deleted.

## What round one built (commits 97f964f to 317d4f6)

Phases 1 to 7 and 11 of `SPEC-audit-fixes.md`, each with its check. Full suite after: typecheck clean, server 394 (was 385), web 568 (was 561), desktop 88 pass and 47 Mac skips. Details per phase are in HANDOFF "Pick up here".
