# GoOffline handoff

Living state. Update this at the end of every working session.

**Last updated:** 2026-09-16, end of first build session.

---

## Where things stand

| Milestone | State |
|---|---|
| M0 infra | **Not started.** Needs a droplet, which needs Wes to buy one. Deploy path decided (see below). |
| M1 text skeleton | **Server done, client in progress.** |
| M2 roles and permissions | **Server done and tested.** No settings UI yet. |
| M3 voice | **Scaffolding done.** Token minting, voice state, permission-gated grants. Needs a real LiveKit server. |
| M4 video and screen share | Permissions and grants exist. No UI. |
| M5 feel | Not started. |
| M6 desktop | Not started. |
| M7 text end-to-end encryption | Schema and wire format ready. No key exchange yet. |

**Repo:** https://github.com/MilkManManiac/GoOffline (private)

## What runs right now

```bash
npm install                       # once
bash scripts/dev-restart.sh       # clean database, start API on :8787
npm run smoke --workspace server   # 47 end-to-end checks, all passing
```

The client is not runnable yet. `npm run dev` will start both once the
remaining components below exist.

## Done this session

**Shared** (`shared/src/`) — permission bitmasks and the full Discord-style
resolution algorithm, wire types, gateway protocol, validation limits. Used by
both sides so they cannot drift.

**Server** (`server/src/`) — complete. Accounts with argon2id and TOTP,
sessions in httpOnly cookies, invite-only registration, servers, categories,
channels, channel permission overwrites, messages with pagination and slowmode,
attachments, roles with hierarchy, bans, audit log, read states, and a
permission-filtered WebSocket gateway. Voice token minting is written and gated
behind LiveKit config.

**Tests** — `server/src/scripts/smoke.ts`, 47 checks over real HTTP including
every privilege-escalation path. It found a real bug: first-run registration
passed a null invite code, which was the exact condition that triggered the
invite-required error, so the first account could never be created.

**Web** (`web/src/`) — design tokens and full stylesheet, API client, gateway
client with backoff, and the state store. Components not yet written.

## Next, in order

1. **Finish the client.** Missing files, all under `web/src/`:
   - `main.tsx`, `App.tsx`
   - `screens/AuthScreen.tsx` — sign in, register, first-run, TOTP prompt
   - `components/ServerRail.tsx`, `ChannelSidebar.tsx`, `MessageList.tsx`,
     `Composer.tsx`, `MemberList.tsx`, `UserPanel.tsx`
   - The store and stylesheet already define everything they need.
2. **Screenshot it and hand it to Wes.** He generates ideas by using the thing,
   so this matters more than any further backend work.
3. **M0 infra** once he has a droplet.
4. **Settings UI** for roles and channel permissions. The API is done and
   tested; this is pure frontend.

## Decisions made this session

- **No Docker.** His buddy's deploy tool, `bonesdeploy`
  (https://github.com/AlextheYounga/bonesdeploy), is Rust, uses systemd plus
  nginx, isolates each site with its own Linux user and AppArmor, and keeps
  secrets in a GPG-encrypted file. Wes said he will probably use it. It is a
  better fit than Docker Compose and removes a dependency. **This supersedes
  the Docker and Caddy parts of GAMEPLAN.md.** Nginx replaces Caddy.
- **PGlite for local development.** There is no Docker on the Windows machine.
  PGlite is Postgres compiled to WebAssembly, so a clone runs with zero
  installs and production uses the same SQL and the same migrations.
- **Dropped `@fastify/static`.** It carries a high-severity path traversal
  advisory. Nginx serves the built client instead. The production dependency
  tree now audits clean; the four remaining advisories are dev-only tooling.
- **LiveKit tokens minted by hand** with `node:crypto` rather than the server
  SDK. A LiveKit token is a plain HS256 JWT, so this is about thirty lines and
  removes a large dependency from the process holding our data.
- **UUIDv7 ids**, so ids sort chronologically and message pagination needs no
  extra index.

## Traps for the next session

- **Do not weaken the 404-not-403 rule.** A channel a member cannot view must
  report "does not exist" everywhere, including the gateway. Returning 403
  confirms the channel exists, which leaks its existence and its id.
- **Permission masks are bigint, and JSON cannot carry them.** They travel as
  decimal strings. `drizzle-kit` also cannot serialize a bigint column default,
  which is why defaults use ``sql`0` `` rather than `0n`.
- **`hub.invalidateServerPermissions` is deliberately blunt.** It drops the
  cache and tells clients to refetch rather than computing a delta. Computing
  deltas is where privilege bugs live. Leave it alone.
- **Never kill every node process on this machine.** Use
  `scripts/dev-restart.sh`, which stops only the process on the API port. A
  blanket `taskkill` takes down Wes's other tooling.
- Windows has no Docker and no Postgres. Do not write instructions assuming
  either.

## Open questions for Wes

- Domain name for the instance.
- Whether to stand up the droplet now or keep building locally. Local is free
  and nothing is blocked by it yet.
