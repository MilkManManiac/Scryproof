# GoOffline

Wes's own Discord: servers, channels, roles, voice, video, screen share. Private, self-hosted, ours.

**Read `GAMEPLAN.md` before doing anything.** It is the build brief and the authority. `PLAN.md` is background research. `docs/HANDOFF.md` (create it on first session) is the living state.

## Non-negotiables

1. No third-party service in the data path. No Clerk/Auth0/Supabase/Firebase/Sentry/PostHog/Uploadthing/Google Fonts/CDN scripts/Cloudflare proxy. If a library phones home, it doesn't ship.
2. Voice, video, and screen share are end-to-end encrypted (LiveKit E2EE) from Milestone 3 onward. Never "temporarily" disabled.
3. Permissions are computed on the server. The client only hides buttons.
4. Every milestone ends with a URL Wes can open and a screenshot in `docs/HANDOFF.md`. No milestone ends in a document.
5. One box, one `docker-compose.yml`, one LUKS-encrypted volume. Must be movable to another host by restore + DNS change.
6. No Discord-clone tutorial code. Write it, understand it, own it.
7. Every voice UI shows the connection panel (RTT, jitter, loss, TURN yes/no). Diagnose with instruments, not guesses.

## Working with Wes

Follow the `milk-project` skill. Short version: he's not a developer but he is the fastest error-detector you'll work with. One terminal command at a time, get the paste or screenshot, then the next. Don't ask him to design; build it and let him choose between real alternatives. Don't flatter. Say when he's wrong. Read `references/the-wall.md` in that skill before any redo or when the project feels stuck.

Secrets live in `infra/.env` on the box only. Never commit them.
