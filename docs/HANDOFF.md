# GoOffline handoff

Living state. Update this at the end of every working session.

**Last updated:** 2026-09-16, end of fourth build session.

---

## Where things stand

| Milestone | State |
|---|---|
| M0 infra | **Not started.** Needs a droplet, which needs Wes to buy one. Deploy path decided (see below). |
| M1 text skeleton | **Done. Runs locally, end to end.** |
| M2 roles and permissions | **Done.** Server, settings UI, hierarchy reordering, audit log. |
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

![Role permissions](shots/settings-roles.png)

![Channel permission overwrites](shots/settings-channel-permissions.png)

![Audit log](shots/settings-audit-log.png)

![The role hierarchy, seen by a moderator who cannot reach the top of it](shots/settings-role-order.png)

## Done this session

**Role reordering, which is the hierarchy editor.** Order is meaning in a role
list — the role at the top outranks everything beneath it — so dragging a row
is the edit, not a sort preference. Roles carry a grip; @everyone sits below a
divider because it is the floor and does not move.

**One request, not one per role.** A drag past four others changes five
positions. As five PATCHes that is five audit entries, five broadcasts and five
permission-cache invalidations for one gesture, with four intermediate
orderings on the wire that nobody asked for. `PATCH
/api/servers/:id/roles/order` takes the whole order, renumbers it in a
transaction, and emits one `roles_reorder` event carrying every role.

**The hierarchy rule here is stricter than it first looks.** Checking that each
role lands below the actor's own highest is not enough: it would still let them
shuffle the roles *above* them relative to each other, or push one of those
below their own. So every role at or above the actor's highest must arrive as
an unchanged prefix. The owner is exempt, as everywhere.

**Arrow keys work on the grip.** A hierarchy that can only be rearranged with a
mouse is a hierarchy some people cannot rearrange.

**Verified against the running server**, not by reading it: as owner, moving
the bottom role to the top renumbered all three and wrote a `role.reorder`
audit entry. As a moderator whose highest role is second from the top, a legal
swap below him returned 200, lifting a role over his own head returned 403
`You cannot move roles at or above your own highest role`, and a short list
returned 400 `incomplete_order`. In the client, an arrow-key move persisted to
the database, and holding the arrow key against the locked band did nothing at
all — no snap-back, no doomed request.

**One CSS bug found in the screenshot:** toggle rows were running their label
and description together as one line ("Show separately in the member
listHolders are grouped…"). The permission rows get two lines from
`.perm-text`; these carry their text in a bare span and needed it spelled out.

## Done in the previous session


**The settings screen, which is what M2 was missing.** A full-screen overlay
rather than a dialog, because the role editor is two panes and the permission
lists are long.

- **Roles.** Create, rename, colour, hoist, mentionable, delete, and the full
  26-bit permission checklist with a sentence under every row explaining what
  the bit actually does. Assign and unassign the role from its Members tab.
- **Channel permissions.** Deny / inherit / allow per permission, per role or
  member, with the inherited outcome printed next to every neutral row so
  nobody has to hold the resolution order in their head.
- **Members**, with role toggles and kick and ban; **Invites**, with revoke;
  **Bans**, with lift; and the **audit log** rendered as sentences rather than
  a table of action strings and ids.

**Two rules made visible instead of hidden in an error.** A permission the
editor does not hold themselves is drawn disabled with the reason on hover,
and a role at or above their own highest is listed but locked. Both are
mirrors of `server/src/services/permissions.ts` — the server checks again on
every request, and if the two ever disagree the server wins.

**The inherited-permission hint is computed with `computeBasePermissions` from
the shared package**, the identical function the server runs, rather than a
second implementation written for the UI. Two implementations of a permission
algorithm drift, and the day they drift is the day this screen says a channel
is private when it is not.

**Verified by driving the real UI**, not by reading the code: clicked Deny on
one bit in `#general` and confirmed the server stored `deny: "64"`
(MENTION_EVERYONE) and wrote an audit entry; changed a role colour through the
save bar and confirmed it landed; signed in as `alex`, who has Manage messages
and Kick but not Manage roles, and confirmed the Roles, Bans and Audit log
sections and the channel gear are all absent for him.

**One CSS bug found and fixed:** `.field label` was styling nested toggle rows
as small uppercase captions, which turned a role name into a heading. It is
`.field > label` now.

## Next, in order

1. **M0 infra** once he has a droplet. GAMEPLAN.md section 2b is the brief:
   `bonesdeploy init` with the custom template, build and prepare scripts,
   LUKS by hand first, LiveKit and coturn as plain units. Ask Alex whether the
   generated nginx config passes WebSocket upgrades before starting.
2. **M3 voice for real** — a LiveKit server, then the client side with E2EE on
   from the first frame, and the connection panel wired to actual stats. The
   panel is already on screen during a call and honestly reports that media is
   not connected.
3. **Category permissions.** Channels inherit from the server, not from their
   category; the schema has categories and the sidebar groups by them, but a
   category carries no overwrites of its own yet.

## Decisions made this session

- **Reordering is one request for the whole order, not a position per role.**
  Partial orderings on the wire are states nobody asked for, and each one costs
  a permission-cache invalidation.
- **Positions are renumbered densely from the top on every reorder.** The
  column is not unique and never was; treating the submitted list as the truth
  and rewriting the numbers under it removes the collision question entirely.
- **Roles above the actor arrive as an unchanged prefix or the request is
  refused.** Per-role bounds checking would still permit rearranging the band
  above them.

## Decisions made building the settings screen

- **Neutral is a first-class state in channel overwrites.** A two-state
  control cannot express "this channel has no opinion, inherit the roles",
  which is not the same as denying. Every row is Deny / Inherit / Allow.
- **Roles above yours are shown, not hidden.** Knowing a role exists is not a
  leak, and a hierarchy list with silent gaps cannot be reasoned about. They
  carry a lock and cannot be opened.
- **Every permission row carries a sentence.** A screen where each row is a
  two-word label is how someone hands a friend Manage roles without
  understanding they have handed over the server.
- **The audit log is rendered in sentences.** `channel.permissions` next to a
  UUID is the same information and practically useless.

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
