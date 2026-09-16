# GoOffline handoff

Living state. Update this at the end of every working session.

**Last updated:** 2026-09-16, end of second build session.

---

## Where things stand

| Milestone | State |
|---|---|
| M0 infra | **Not started.** Needs a droplet, which needs Wes to buy one. Deploy path decided (see below). |
| M1 text skeleton | **Done. Runs locally, end to end.** |
| M2 roles and permissions | **Server done and tested.** No settings UI yet. |
| M3 voice | **Scaffolding done.** Token minting, voice state, permission-gated grants. Needs a real LiveKit server. |
| M4 video and screen share | Permissions and grants exist. No UI. |
| M5 feel | Not started. |
| M6 desktop | Not started. |
| M7 text end-to-end encryption | Schema and wire format ready. No key exchange yet. |

**Repo:** https://github.com/MilkManManiac/GoOffline (private)

## Run it

```bash
npm install                        # once
bash scripts/dev-restart.sh        # clean database, API on :8787
npm run seed --workspace server    # four accounts, a server, a real conversation
npm run dev:web --workspace web    # client on :5173
```

Then open **http://localhost:5173** and sign in as `wes` (or `alex`, `mara`,
`dev`) with the password the seed prints. Those accounts exist only in the
local PGlite database, which `dev-restart.sh` wipes.

`npm run dev` at the root starts the API and the client together.

## Screenshots

![The app](shots/app.png)

![Sign in](shots/signin.png)

## Done this session

**The client is finished and working.** `main.tsx`, `App.tsx`, the auth screen,
server rail, channel sidebar, message list, composer, member list, user panel,
avatars and dialogs. Creating a server, creating channels, minting an invite,
joining with one, posting, editing, deleting, uploading, typing indicators,
presence and voice presence all work against the real API.

**A seed script**, `server/src/scripts/seed.ts`. It drives the public HTTP API
the way a browser does — register, invite, join, assign a role, post — so if
the seed succeeds the app genuinely works. It refuses to run on an instance
that already has accounts.

**Two real fixes found by looking rather than guessing:**

- *The gateway signed you out immediately.* A socket closed by us reported
  `closed`, which the app reads as "the session is gone". React's development
  double-mount closes the first socket, so every load bounced straight back to
  the sign-in screen. A deliberate close now reports nothing.
- *Avatar colours were hashed to any hue on the wheel*, which produced neons
  that fought the interface and, side by side, looked randomly generated. They
  now come from a fixed ten-colour palette chosen against the theme.

**Two small gaps closed:** `slowmodeSeconds` was stored and enforced but never
sent to the client, so the composer could not show it; it is on the wire type
now. The root `typecheck` script pointed at a `tsconfig.json` that does not
exist, so it had never run; it now checks `server` and `web` directly. Both
pass.

## Next, in order

1. **Hand it to Wes.** He generates ideas by using the thing. Everything below
   this line is less valuable than his first ten minutes in it.
2. **M0 infra** once he has a droplet. GAMEPLAN.md section 2b is the brief:
   `bonesdeploy init` with the custom template, build and prepare scripts,
   LUKS by hand first, LiveKit and coturn as plain units. Ask Alex whether the
   generated nginx config passes WebSocket upgrades before starting.
3. **Settings UI** for roles and channel permissions. The API is done and
   tested; this is pure frontend.
4. **M3 voice for real** — a LiveKit server, then the client side with E2EE on
   from the first frame, and the connection panel wired to actual stats. The
   panel is already on screen during a call and honestly reports that media is
   not connected.

## Decisions made this session

- **The connection panel ships blank rather than fake.** During a call it shows
  the signalling state truthfully and prints an em dash for RTT, jitter, loss
  and TURN until there is a media connection to measure. A panel that invents
  plausible numbers is worse than no panel.
- **Message bodies are rendered as text.** No markdown pass,
  no `dangerouslySetInnerHTML` anywhere in the client, so a message can never
  become markup in someone else's browser.
- **Channel permissions are fetched, not recomputed client-side.** The client
  has the roles but not every overwrite, and a second implementation of the
  resolution algorithm is how the two drift apart. `useChannelPermissions` asks
  the server and fails closed on a 404.

## Decisions carried from the previous session

- **No Docker.** His buddy's deploy tool, `bonesdeploy`
  (https://github.com/AlextheYounga/bonesdeploy), is Rust, uses systemd plus
  nginx, isolates each site with its own Linux user and AppArmor, and keeps
  secrets in a GPG-encrypted file. GAMEPLAN.md was rewritten to match on
  2026-09-16; section 2b is the deploy brief. Nginx replaces Caddy.
- **PGlite for local development.** There is no Docker on the Windows machine.
  PGlite is Postgres compiled to WebAssembly, so a clone runs with zero
  installs and production uses the same SQL and the same migrations.
- **Dropped `@fastify/static`** over a high-severity path traversal advisory.
  Nginx serves the built client. The production dependency tree audits clean.
- **LiveKit tokens minted by hand** with `node:crypto` rather than the server
  SDK. About thirty lines, and it keeps a large dependency out of the process
  holding our data.
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
  `scripts/dev-restart.sh`, which stops only the process on the API port.
- **The seed refuses to run on a used instance.** That is correct, not a bug.
  Restart first.
- Windows has no Docker and no Postgres. Do not write instructions assuming
  either.

## Open questions for Wes

- Domain name for the instance.
- For Alex: does bonesdeploy's generated nginx config pass WebSocket upgrades?
  (GAMEPLAN 2b.) Our gateway needs it.
- Whether to stand up the droplet now or keep building locally. Local is free
  and nothing is blocked by it yet.
