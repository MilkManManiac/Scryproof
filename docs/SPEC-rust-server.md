# Spec: the Scry server in Rust

Written 2026-11-05 by Fable from Wes's words and a Sonnet survey of `server/`. **Status: parked, ready to launch.** Wes: "write the build plan, and then let's plan to do this at some point. Maybe not today, but at some point." Nothing starts until he says go; nothing deploys until he says deploy.

## Summary (the builder writes this last, at the top)

_Plain English for a non-programmer. What runs now, how to run it, which screenshots, what does not work yet, three things to try, the check numbers, and whether it actually ran. Also: the one-day number (section "The bet")._

---

## Wes's words

- 2026-11-05: **"We are going to rewrite it in Rust."**
- 2026-11-05, on a three-month estimate: **"Bullshit. 3 months. I bet we could do it in a day."**
- 2026-11-05: "write the build plan, and then let's plan to do this at some point. Maybe not today, but at some point."
- Standing, from `GAMEPLAN.md`: his priorities are **"it's ours, our data is secure, and latency."** And: "doesn't have to be the easiest way it has to be the right way" (2026-09-24). "nothing goes in and out that shouldn't be" (2026-09-24).
- Trey wanted Rust in the project (his Rust agent-CLI skills were applied to the agent channel's CLI design, `docs/agent-channel-spec.md` draft 3).

## What this is

The Node/TypeScript server in `server/` becomes a Rust program in `server-rs/` that speaks the exact same HTTP and websocket contract, against the same Postgres database, behind the same nginx. The web client, the shared TypeScript package, the Windows and Mac apps, the Activities service and every check script stay as they are and must not notice the swap. Done means: the Rust server passes every black-box check the Node server passes, runs on the box on its own port next to the Node server, and Wes switches nginx to it with one deploy that can be switched back in one line.

Why Rust, so the builder knows what to optimise for: one static binary (the installer for strangers gets simpler), a fifth of the memory on a small box, and a runtime that does not fall over at night. Not for speed of chat; Node was never the bottleneck.

What it is not: not a redesign. No new features, no renamed routes, no "while we are here." The TypeScript is the spec; the black-box scripts are the judge.

## The bet

Wes says a day. The clock starts when the first lane launches on Phase 0 and runs 24 hours wall-clock. At the 24-hour mark, whoever is running writes into the summary: phases finished, `smoke.ts` checks passing out of its total, `test:prod` passing or not, and total builder-hours used across lanes. Then the build keeps going to the end of the phases. The number is the point; the build does not stop for it.

## Who this is for, and the stance

Opus lanes, a helper agent, or a cloud session. Wes is not watching and will not answer. Never stop to ask. Make the call, log it under "Decisions I made" at the bottom, keep going. Fable reviews at milestones only (end of Phase 1, end of Phase 5, end of Phase 10), reading this file's summary and the check numbers, not the transcript.

## Ground rules

- **Branch:** `rust-server`, from `main`. Lanes that run in parallel branch from `rust-server` as `rust-server/<module>` and PR back into `rust-server`. Never push to `main`. Never touch anyone else's branch.
- **Fence. May change:** `server-rs/**`, this file, `docs/shots/rust-server/**`, `docs/HANDOFF.md` (the Pick-up block only, at the end). **May add, in Phase 10 only, as files that nothing runs yet:** a systemd unit template and an nginx change under `infra/custom/` for the Rust binary, clearly named `-rs`. **May never change:** `server/`, `web/`, `shared/`, `desktop/`, `infra/.env*`, signing or publish scripts, `scripts/release.sh`, any existing check script. If a check script seems wrong, log it; do not edit it.
- **No deploy.** Nothing in this spec reaches the box. The cutover section at the end is Wes's, after his explicit "deploy now."
- **No Docker anywhere**, including for the local Postgres. The box runs no Docker (CLAUDE.md rule 5), and one habit is easier than two.
- **No third party in the data path** (rule 1). Crates are compile-time dependencies and are fine. No crate may make a network call the TypeScript server does not already make (link previews, S3 when configured, web push to the platform push services). `cargo tree` goes in the summary.
- **E2EE untouched** (rules 2 and 8). The server relays wrapped keys and signals; it never holds a key that decrypts anything. If a port step seems to need plaintext, the port step is wrong.
- **Permissions computed on the server** (rule 3), same algebra, same bits, same defaults.
- **Stuck rule:** two honest attempts, then log it under "Open problems" with what was tried, and move on. Cap per port-map module: four hours of lane time; past that, log and move on.
- **Style:** `cargo fmt`, `cargo clippy -- -D warnings` clean at every push. Match the TypeScript's names for routes, events, fields and error strings exactly; a client-visible string that differs is a bug. No emoji anywhere. Short plain log lines.
- **Push after every phase.** A phase ends with a passing check, a named screenshot or captured output in `docs/shots/rust-server/`, and a push.
- **Paid-for lessons from `PAPERCUTS.md`** (read the file; the ones that bite here): long prose heredocs fail in the Bash tool, use Write; a worktree removal once wiped a checkout, so no temp copies or junctioned `node_modules`; restart the dev API after a migration or route change; Windows paths in scripts use forward slashes.
- **His PC:** 16 GB RAM. Rust compiles are heavy. At most **two lanes compiling at once on his PC**; check free RAM before a build (`(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB`), and under 4 GB free run one. Cloud sessions or Trey's and Matt's machines carry more lanes. Tell him in one line when a build will drag.
- **Catch-up rule:** `server/` keeps changing on `main` while this runs (the agent channel PR, fixes). Every lane notes the `main` commit it branched from. Phase 10 lists every `server/` commit since the branch point and ports each one before the gate. Cutover is honest only when that list is empty.

## Phase 0: tools and the clock

1. Install the Rust toolchain for the builder's machine (rustup, stable). On Wes's PC this is a user-level install; say so in the summary. Note `rustc --version`.
2. A local Postgres with no Docker. On Wes's PC: the existing WSL Ubuntu (`apt install postgresql`), a database `scry_rs`, `DATABASE_URL` pointing at it. On a cloud session: `apt install postgresql`. Record the exact commands in the summary.
3. **Baseline, before any Rust:** run the Node server locally the way `scripts/release.sh --check-only` does, then `npm run test:smoke` against it and `npm run test:prod`. Write the numbers (smoke checks total and passing, prod checks total and passing, the Node process's resident memory at idle and after the smoke run) into "Baseline" under the summary. Those are the numbers Rust must match, and the memory number is what Rust must beat.
4. `cargo new server-rs --name scryproof-server`, a `README.md` inside it with the run command, and a `/api/health` that returns what the Node one returns. Prove the web client's Vite dev server can be pointed at it (find where the dev proxy target lives in `web/`; do not edit `web/`, use the env or flag it already supports, or run the client against the Rust port with a one-line local override that is not committed).

**Check:** `curl /api/health` on the Rust port matches the Node response byte for byte. `cargo clippy` clean. **Must never happen:** a change under `server/`, `web/` or `shared/`.

**Start the clock here.**

## What to read first

- `CLAUDE.md`, `GAMEPLAN.md` (the nine rules), the top of `docs/HANDOFF.md`, `PAPERCUTS.md`.
- `server/src/index.ts` (71 lines): boot order. `server/src/app.ts` (279 lines): the whole assembly, the hooks, the error handler, 28 route registrations.
- `shared/src/gateway.ts` (317 lines): every websocket event, both directions. `shared/src/types.ts` (601 lines): every DTO the client expects. `shared/src/permissions.ts` (343 lines): the bitmask algebra. `shared/src/validation.ts` (423 lines) and `LIMITS`.
- `server/src/gateway/hub.ts` (652 lines) and `gateway/index.ts`: the in-memory state and the ready payload.
- `server/src/db/schema.ts` (1230 lines, 51 tables) and `server/drizzle/` (37 SQL files plus `meta/_journal.json`).
- `server/src/services/auth.ts`, `lib/crypto.ts`, `services/totp.ts`: everything that must stay byte-compatible with rows already in the database.
- `server/src/scripts/smoke.ts` (802 lines), `scripts/prod-check.mjs`, and the `scripts/*-check.mjs` files: the judges.
- `infra/custom/templates/site-nginx.conf.j2`: what sits in front, which paths proxy where, port 8787.
- `docs/channel-e2ee.md` and `docs/voice-e2ee.md`: what the server must and must not do with keys.

## The design

**Crates, chosen for being standard and boring:** `tokio`, `axum` (HTTP and websocket in one), `tower-http` (security headers, request ids), `sqlx` with the `postgres` and `runtime-tokio` features (runtime queries, no compile-time DB needed), `serde` and `serde_json`, `argon2` (argon2id, m=19456, t=2, p=1, PHC string output, same as `@node-rs/argon2`), `totp-rs` (match otplib v13's period, digits and window before trusting it), `hmac` + `sha2` (cookie signatures, LiveKit HS256), `aes-gcm` + `hkdf` (the `encryptSecret`/`decryptSecret` byte format), `jsonwebtoken` or `p256` (VAPID ES256), `uuid` with v7, `reqwest` with rustls (link previews, S3, push), `tracing` + `tracing-subscriber`, `rand`. Anything else gets a line under "Decisions I made" saying why. Static build target `x86_64-unknown-linux-musl` for the box.

**Layout of `server-rs/src/`**, mirroring the TypeScript so a reader can walk both:
`main.rs` (boot order identical to `index.ts`), `config.rs` (same env var names, same defaults, same "required in production" rules), `app.rs` (router, hooks as middleware, error mapping), `routes/` (one file per TypeScript route file, same names), `services/`, `gateway/` (`hub.rs`, `voice.rs`, `mod.rs`), `db/` (pool, migrations, queries), `lib/` (crypto, ids, client_ip, rate_limit, http_error, web_push), `contract/` (the Rust twins of `shared/`: types, gateway events, permissions, validation, limits), `games/` (daily games), `bin/reset_password.rs`.

**The contract.** `shared/` stays the source of truth and stays TypeScript. `server-rs/src/contract/` is its Rust twin, hand-ported, with every DTO's serde names matching the TypeScript field names exactly (camelCase on the wire, whatever Rust wants inside). The gateway `ServerEvent` union (about 70 names) becomes one enum with `#[serde(tag = "t", content = "d")]`. Permissions are a `u64` bitmask; the DB column is `bigint`, so read and write through `i64` with a wrapping cast both ways and a unit test on bit 63. Big data files for the daily games (`thrice/questions.ts`, `bee/words.ts`, `cuntections/puzzles.ts`, the rest) are not retyped: a one-off Node script in `server-rs/scripts/dump-game-data.mjs` writes them to `server-rs/data/*.json`, committed, loaded with `include_str!`, and a check script diffs the dump against the TypeScript so drift is caught.

**Database.** Postgres only. PGlite is gone; tests need a real Postgres (the local one from Phase 0). Fresh install: apply the 37 drizzle SQL files in `meta/_journal.json` order through raw `sqlx` exec and record them in the same `__drizzle_migrations` table shape, so a database that the Node server already migrated is recognised as current and nothing runs twice. Future migrations are plain SQL files in `server-rs/migrations/` applied by the same runner. Raw SQL that exists in the TypeScript (`read-state.ts`, `dms.ts`, `sounds.ts`, `schema.ts` fragments) is ported as the same SQL.

**Sessions and cookies.** Cookie name, TTL and SameSite as `config.ts`. The signature format of `@fastify/cookie` (`value.signature`, HMAC-SHA256 over the value with `SESSION_SECRET`, base64) is verified against a real cookie minted by the Node server in Phase 1, so nobody is signed out at cutover. Session rows are read from the same `sessions` table.

**Password hashes and secrets.** A user created by the Node server signs in to the Rust server with the same password (Phase 1 check). `encryptSecret`/`decryptSecret` output from Node decrypts in Rust and the reverse. TOTP codes from the same secret agree on both for the same 30-second window.

**Gateway.** `axum::extract::ws` on `/gateway`, same origin check, same cookie resolution, same `ready` payload, heartbeat 25 s with 100 s timeout, voice signal cap 4096 bytes, six client events, the server event enum. The hub is **one tokio task that owns all the maps** (connections, byUser, permission cache, voiceStates, voice epochs and intents) and takes commands over an mpsc channel; no shared mutable maps behind locks. Fan-out goes through per-connection mpsc senders. `permissions_stale` invalidation and `closeSessions` behave as in `hub.ts`. Rate-limit buckets, recent pings and the link-preview caches are in-process, as today.

**Voice.** Hand-rolled HS256 LiveKit token exactly as `services/livekit.ts` (single room, 600 s, per-source grants, same claims, same order of fields is not required but the same claim names are). `voice_signal` relay and `voice_owned` handoff as `gateway/voice.ts`. No LiveKit SDK, no REST client, no webhooks, none exist today.

**Files.** Multipart through axum, same limits from `LIMITS`, same `DATA_DIR/uploads/xx/<uuid><ext>` layout so existing uploads keep serving, same path-traversal guard, same inline-type allow-list on `GET /api/attachments/:id/:filename`. Ogg duration check for sounds ported from `shared/src/ogg.ts`. S3 driver last and only if time allows; local disk first.

**Push.** Web Push by hand as `lib/web-push.ts`: empty-body ping, VAPID ES256. Payload carries nothing readable, as today.

**Errors and headers.** The same status codes, the same JSON error shape, the same security header set and HSTS-in-prod rule as the `onSend` hook, the same empty-body-is-`{}` parse, the same 1 MB body limit, the same origin check on state-changing requests, the same "must change password" lockout, `trustProxy` off with the same X-Forwarded-For reading as `lib/client-ip.ts`.

**Edges.** Empty server, server with no channels, a member with every permission removed, a channel the user cannot see, an upload at exactly the limit, a session cookie with a bad signature, a websocket that never heartbeats, a restart with voice states in memory (they are lost today; they are lost the same way).

## Phases

Each phase ends runnable, with its check captured into `docs/shots/rust-server/<phase>.txt` or `.png`, and pushed. Parallel lanes are named where they help; a single builder does the phases in order.

**Phase 1: boots, signs in, keeps the session.** `config.rs`, logger, error shape, headers, DB pool, migration runner against a fresh DB (all 37 files, journal order) and against a copy of a Node-migrated DB (recognised as current, zero applied). Cookie parse and verify, session resolution, argon2 verify, `/api/auth/*` (11 routes), TOTP, host reset-password binary. Rate limits.
**Check:** a user and session created by the Node server on the same DB sign in and stay signed in on the Rust server; a fresh DB migrates to the same table list as the Node one (diff `\dt` output, zero lines). **Must never happen:** a hash, cookie or secret format that forces anyone to sign in again or re-pair 2FA.

**Phase 2: the contract.** `contract/` complete: types, permissions algebra with the defaults, validation with the same error strings, LIMITS, the gateway event enum. Rust unit tests ported from the `shared` test cases the web suite runs (permissions, content validation, dice, polls). A `server-rs/scripts/parity.mjs` that takes a list of sample DTOs serialised by the TypeScript and by Rust and diffs the JSON.
**Check:** `cargo test` green; parity diff empty for every DTO in `types.ts`.

**Phase 3: servers, roles, invites, channels, categories, audit.** Routes and `services/permissions.rs`, `server_detail.rs`, `serialize.rs`. (Lane A if parallel.)
**Check:** the smoke script's server and channel sections pass against Rust; a member with a channel overwrite sees exactly what they see on Node (screenshot of both, same account).

**Phase 4: the gateway.** Hub actor, `ready`, presence, typing, attention, heartbeat, `permissions_stale`, `closeSessions`. (Lane B, after Phase 3's serialize lands.)
**Check:** two browsers on the Rust server see each other come online and go idle; sign-out-everywhere drops the other browser's socket within a second. Capture the frames.

**Phase 5: messages.** Messages, reactions, mentions, polls, search, bookmarks, read state, expiry sweep, the three interval sweeps from `index.ts`. (Lane A.)
**Check:** two browsers chat on Rust with reactions, a mention badge and an unread count that clears; smoke's message sections pass. **Milestone: Fable reads the summary.**

**Phase 6: DMs, group DMs, blocks, privacy.** (Lane B.)
**Check:** smoke's DM sections and `scripts/dm-check.mjs` pass.

**Phase 7: files.** Storage, attachments, emojis, sounds, server icon, avatars, upload sweep, `/download/:name`. (Lane C.)
**Check:** an image uploaded on Node serves from Rust at the same URL; a new upload on Rust lands in the same layout; `exif-check.mjs` passes; a sound over the Ogg limit is refused with the same message.

**Phase 8: keys and voice.** Channel-key relay (`/keys`, `/key-devices`, `/epochs`, `/keys/wanted`, `/keys/request`, the `channel_keys` event), LiveKit tokens, `gateway/voice.rs`, voice moderation routes. (Lane B, after Phase 4.)
**Check:** two browsers in an end-to-end encrypted voice call through the Rust server with the connection panel showing RTT, jitter, loss and TURN; `voice-check.mjs` and `channel-check.mjs` pass; the Rust server's logs contain no key material (grep for the wrapped-key field names in the log output, zero hits). **Must never happen:** a decrypt anywhere in `server-rs/`.

**Phase 9: the rest.** Push, link previews and the YouTube card cache, events and reminders, trackers (dice, initiative, house rules), the daily games with the JSON data dump and its drift check, host routes. (Lane C.)
**Check:** `push-check.mjs` passes; one daily game plays to a scored result on Rust and the score matches Node for the same input.

**Phase 10: the gate, the binary, the catch-up list.** Full `smoke.ts` against Rust; `test:prod` with the Rust build behind the stand-in nginx; every `scripts/*-check.mjs`; `cargo clippy` and `cargo test` green; the parity corpus diff empty; the musl static binary built and its size noted; resident memory at idle and after smoke next to the Node baseline; a `cargo tree` listing. The catch-up list: every commit touching `server/` on `main` since the branch point, each ported and ticked. New files under `infra/custom/` for a `scryproof-rs` systemd unit on port 8788 and an nginx variant, committed, not deployed. Update the Pick-up block in `docs/HANDOFF.md`. **Milestone: Fable reviews. Wes sees the numbers.**
**Check:** every number in the gate equals or beats the baseline. **Must never happen:** anything deployed; `scripts/release.sh` run.

**After the list runs out:** do not stop. The S3 driver, then a `cargo deny` or `cargo vet` pass on licences, then any "Open problems" item that now has an obvious fix. Log why each was chosen.

## Cutover (Wes's, not the builder's)

Written here so the plan is whole. Needs his explicit "deploy now" for each step.

1. Dark launch: the Rust binary on the box on 127.0.0.1:8788 against a restored copy of the database, reachable on a test hostname, for a day of the three of them using it.
2. Switch: in a quiet hour, nginx `proxy_pass` from 8787 to 8788 against the live database. The Node service stays installed and stopped.
3. Rollback is the same nginx line back to 8787 and `systemctl start` on the Node unit. Both are one command each and are written in the handoff before step 2.
4. After a week on Rust with no rollback, the Node unit is removed and `server/` is archived in the repo (not deleted; it is the spec).

## Decisions I made (Fable, 2026-11-05; overrule any)

- Same repo, `server-rs/` beside `server/`, one PR flow, so Trey's and Matt's agents see it. Not a second repo.
- axum + sqlx + tokio. Boring, documented, what every Rust agent already knows.
- Postgres only; PGlite dropped; tests run against a real local Postgres without Docker.
- The 37 drizzle SQL files are reused as the schema history and the same migration table is honoured, so a live database needs no conversion at cutover.
- The judge is the black-box scripts (`smoke.ts`, `test:prod`, the `*-check.mjs` files) plus a JSON parity diff, not a port of the 42 TypeScript test files. Pure-logic tests from `shared` are ported as Rust unit tests because they are the contract.
- Game data is dumped to JSON, not retyped. A drift check keeps it honest.
- The hub is one actor task, not locked maps.
- The bet is measured at 24 hours and the build continues; the number is recorded either way.
- Two lanes compiling at once on Wes's PC, more elsewhere. His PC rule from the global CLAUDE.md.
- The agent channel is not in this port: its code is still on Trey's branch. It enters through the catch-up rule when it lands in `server/`.
- S3 last and optional. Nobody uses it today.

## Open problems

- The web dev proxy target: the survey did not find where `web/` points at the API in development. Phase 0 finds it and records the one-line override here. If it needs a change in `web/`, log it and run the client against Rust through a local nginx stand-in instead.
- `otplib` v13 defaults (window, algorithm) and the `@fastify/cookie` signature encoding were inferred by the survey, not read. Phase 1 reads both before writing a line.
- The connection panel's data path was not traced. Phase 8 traces it before porting voice state.
- Whether `__drizzle_migrations` hashes are reproducible from the SQL files alone. If not, Phase 1 records the live table's rows as a baseline fixture.
