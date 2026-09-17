# GoOffline handoff

Living state. Update this at the end of every working session.

**Last updated:** 2026-09-17, after building the security review's three no-box items.

> **Read GAMEPLAN.md section 1b before building anything in M0 or M3**, and
> `docs/voice-e2ee.md` before touching voice. The server-held voice key is
> gone: `generateChannelKey()`, the `voice_key` gateway event and its client
> case are all deleted, and `web/src/lib/voice-crypto.ts` replaces them. The
> rule that produced that change is non-negotiable 8 — no key that decrypts
> members' content ever exists on the server.

---

## Where things stand

| Milestone | State |
|---|---|
| M0 infra | **Not started.** Needs a droplet, which needs Wes to buy one. Deploy path decided (see below). |
| M1 text skeleton | **Done. Runs locally, end to end.** |
| M2 roles and permissions | **Done.** Server, settings UI, hierarchy reordering, category permissions, audit log. Covered by tests. |
| M3 voice | **Key agreement done and tested** (`web/src/lib/voice-crypto.ts`, `docs/voice-e2ee.md`). Token minting, voice state, permission-gated grants were already fine. Everything left needs a real LiveKit server. |
| M4 video and screen share | Permissions and grants exist. No UI. |
| M5 feel | Not started. |
| M6 desktop | Not started. |
| M7 text end-to-end encryption | Schema and wire format ready. The device identity keys built for M3 are the ones this needs, so half of it is already paid for. |

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

## Test it

```bash
npm test            # 50 server + 49 web assertions. No server needed, about a second.
npm run test:smoke  # 62 assertions over the real HTTP surface
npm run test:exif   # a real headless browser; needs the web dev server on :5173
```

`npm test` covers the permission algebra, the image scrubber's decisions and
the whole voice key agreement including a gateway that cheats. `test:exif` is
the one thing Node cannot do: the canvas round trip that actually removes the
metadata.

`npm run test:smoke` needs a server that has just been restarted and **not**
seeded — it registers its own accounts, and the sign-up rate limiter counts the
seed's four against it.

## Screenshots

![The app](shots/app.png)

![Sign in](shots/signin.png)

![Role permissions](shots/settings-roles.png)

![Channel permission overwrites](shots/settings-channel-permissions.png)

![Audit log](shots/settings-audit-log.png)

![The role hierarchy, seen by a moderator who cannot reach the top of it](shots/settings-role-order.png)

![Category permissions: denying View channel here hides every channel beneath it](shots/settings-category-permissions.png)

## Done this session

**The server-held voice key is gone, and what replaces it is built.** This was
finding 1 of the review and the only thing in it that was a real flaw rather
than a precaution. `generateChannelKey()` and the `voice_key` event are
deleted, with comments where they were saying why, because the next person to
need a voice key will look in exactly those two places.

`web/src/lib/voice-crypto.ts` is the replacement, about 450 lines of WebCrypto
and no new dependencies. Each device holds a non-extractable identity key, makes
a throwaway key per call and signs it, invents its own media key, and wraps a
copy of it for each other participant using a secret only those two devices can
compute. Every join and leave rotates. `docs/voice-e2ee.md` is the write-up the
GAMEPLAN promised.

**The malicious-server test exists, and it found a design bug.** Forty-nine web
tests, most of them a gateway free to tamper with anything passing through: it
substitutes call keys, substitutes identity keys, re-addresses a wrapped key to
a third person, replays one from an old epoch, relabels its epoch, flips a bit,
sends a second key for one sender, and forges an announcement. All refused.

The bug it found: each client was counting epochs on its own, so a device
joining a call in progress disagreed with the room and its keys never opened.
The epoch now comes from the gateway's membership event, clamped so it can only
go up. That hands the server the ordering, which it had anyway, and none of the
key material.

**Four defences verified by sabotage.** Removing the authenticated headers,
skipping signature checks, accepting any epoch, and letting a second key
overwrite the first. The first of those *passed* the suite on the first attempt
— the authenticated headers were covering a case nothing tested, because the
ECDH pairing and the HKDF info already catch every other tampering. The one
thing only they catch is a relay inventing a second device for somebody, so
there is a test for exactly that now.

**Photos no longer carry GPS.** Images are re-encoded through a canvas before
upload, which drops every metadata container at once. If an image cannot be
decoded the upload is refused rather than sending the original, which is the
rule the tests pin hardest. Proven in a real browser by `npm run test:exif`:
it builds a JPEG that really carries coordinates and searches the bytes that
come out, and it checks a 120x80 image comes back rotated to 80x120, which only
happens if the browser genuinely parsed the EXIF being removed.

![The EXIF check](shots/exif-check.png)

**A committed `.npmrc`, tested rather than assumed.** Install scripts off,
exact versions, and a seven-day hold on new releases. A clean `npm ci` installs
242 packages, everything builds, and all 239 production packages have verified
registry signatures. Worth knowing: `npm ci` ignores the hold because it
installs the lockfile verbatim, so the cooldown only bites when npm is choosing
versions — and it bit immediately, refusing a package published four days ago.

## Done before that

**The permission algebra has tests now.** Fifty of them over
`shared/src/permissions.ts`: the overwrite resolution order, the VIEW_CHANNEL
collapse, the mask wire format, and the rule that ADMINISTRATOR does not bypass
the hierarchy. Pure functions, so `npm test` runs in about a second and is
something you actually run before committing. `src/scripts/smoke.ts` still
covers the HTTP wiring against a live server; this covers the algebra under it.

**The tests were verified by sabotage, not by going green.** Five deliberate
breaks of the permission engine were each confirmed to fail the suite. One did
not: swapping allow and deny inside a level changed nothing any test could see.
That order is only observable when a single overwrite carries the same bit in
both masks, which `POST /api/channels/:id/permissions` already rejects as
`conflicting_overwrite` — so the invariant held, but the rule and the check
that protects it live in different files. Two tests pin it now.

**Category permissions, which was the hole.** A category is a permission layer,
not a heading in the sidebar. Its overwrites apply to every channel inside it,
underneath each channel's own:

    server roles  ->  category overwrites  ->  channel overwrites

Deny View channel for @everyone on a category and every channel beneath it
disappears, with nothing to configure per channel. Because the channel level
runs last, one channel can still allow itself back open, which is how a public
channel lives inside a private category.

**Not Discord's model.** Discord copies a category's overwrites into each
channel when you "sync" it. That is two sources of truth that drift the moment
somebody edits one channel, and a category screen that is then lying about half
the channels beneath it. Layering means dropping a channel into a locked
category locks it immediately and moving it out restores it, with nothing to
re-sync.

**Two cache holes this opened, and closed.** Moving a channel between
categories changes who can see it although none of its own overwrites changed,
and deleting a category removes a layer from every channel that was inside it.
Both now invalidate the permission cache. Neither was obvious; both were caught
by asking "what else does making categories matter change?" and then proving it
in the smoke test.

**The overwrite editor is shared, not duplicated.** Channels and categories run
the same algebra one level apart, so they use one component
(`web/src/components/settings/OverwritePane.tsx`). Copying 290 lines of
permission UI is exactly the drift the channel screen's own header warns about.

**Verified against the running server and the running browser**: the smoke test
went from 47 to 62 assertions, covering the category deny hiding a channel, the
channel allow overriding it, a second channel hidden by the same lock, moving a
channel out restoring it, a member without MANAGE_ROLES being refused, and
allow-and-deny-at-once being rejected. Then in the real client, clicking Deny on
View channel for the Text category wrote `deny: "1"` and `alex` immediately saw
only the voice channel — three text channels gone. Cleared afterwards; the local
database is back in seed state.

**One layout fix.** The category screen carries a third column, and the 900px
settings page left permission descriptions wrapping at 258px with 440px of the
window empty beside them. That section gets 1280px now.

## Done in the previous session

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

## Done two sessions ago


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

1. **M0 infra** once he has a droplet. GAMEPLAN.md section 2b is the brief,
   and section 4 grew in the review (box boots dumb, outbound firewall
   allowlist, no DO agents or snapshots, nginx access log off):
   `bonesdeploy init` with the custom template, build and prepare scripts,
   LUKS by hand first, LiveKit and coturn as plain units. Ask Alex whether the
   generated nginx config passes WebSocket upgrades before starting.
2. **M3 voice for real** — a LiveKit server, then the parts of the key
   agreement that need one. The protocol itself is built and tested; what is
   missing is everything around it: gateway events relaying announcements and
   wrapped keys, a `device_keys` table replacing `users.identity_key`, calling
   `GoOfflineKeyProvider.setParticipantKey` as keys arrive, and the
   verification code and identity warnings in the connection panel. Read
   `docs/voice-e2ee.md` first. The panel is already on screen during a call and
   honestly reports that media is not connected.
3. **Category permissions in the sidebar UI.** The permissions themselves are
   done; what is missing is a way to reach them from the channel sidebar. Today
   they live only under server settings, and only once a category exists.

## Decisions made this session

- **Pairwise sender keys, not MLS.** At twenty-five people MLS's scaling buys
  nothing, and the browser options are an unaudited TypeScript library or a
  Rust build compiled to WebAssembly. This is 450 lines over WebCrypto with no
  new dependencies, which means it can be read end to end — its own kind of
  security, given that nobody has audited the composition.
- **The epoch comes from the gateway, not from each client.** A device joining
  a call in progress cannot know how many changes it missed. The server gets
  the ordering, which it had anyway; it gets no influence on the key, because
  the key is fresh on every rotation whatever number arrives and the epoch can
  only go up. Wrong numbers make the call fail closed.
- **Refusals are silent and return null.** A call is a place where a hostile
  relay sends whatever it likes. Each of those is an event to ignore, not an
  error that tears down the call.
- **A changed identity key is never written over the old one automatically.**
  Silently accepting a new key is exactly the move a server in the middle
  needs. It takes a person clicking through a warning that names them.
- **Firefox is refused from voice, not accommodated by turning E2EE off.**
  livekit/client-sdk-js#2103 is open with no fix. Non-negotiable 2 has no
  "temporarily".
- **An image that cannot be stripped is not uploaded.** Falling back to the
  original would defeat the entire point of stripping it.
- **`voice-crypto.ts` lives in the web workspace and imports nothing from
  `shared`.** Key handling the server cannot import is key handling the server
  cannot accidentally acquire.

## Decisions made building categories

- **A category is a layer, not a template.** Discord copies overwrites into
  each channel on sync; we resolve through the category every time. No second
  source of truth, nothing to re-sync, and moving a channel in or out is the
  whole operation.
- **The channel level runs last and wins.** Otherwise "one public channel in a
  private category" is inexpressible.
- **Tests are verified by breaking the thing they watch.** A suite that has
  never been seen to fail is a suite that proves nothing. Five sabotages, and
  the one that survived found a real gap.
- **`npm test` is the pure algebra only.** Anything needing a live server goes
  in the smoke script. A test you have to set up a server to run is a test that
  stops being run.

## Decisions made reordering roles

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

- **The voice key provider has never run against a LiveKit server.**
  `web/src/lib/voice-key-provider.ts` compiles against livekit-client 2.22.3
  and matches its API, and that is all that is known. The first thing to do
  with a server running is watch frames actually decrypt — especially whether
  LiveKit is happy with a non-extractable AES key while ratcheting is off.
- **LiveKit identifies participants by the token's `identity`, which is the
  bare user id.** Two devices for one person collide there. A call is one
  device per person until that is solved, and the key agreement already carries
  device ids for when it is.
- **Do not add a "call history" table.** Voice presence is in memory and stays
  there. GAMEPLAN 1b, finding 4.
- **`npm audit signatures` fails with the cooldown on.** That is the cooldown
  working, not a broken lockfile. Run it as
  `npm audit signatures --min-release-age=0`.

- **Do not weaken the 404-not-403 rule.** A channel a member cannot view must
  report "does not exist" everywhere, including the gateway. Returning 403
  confirms the channel exists, which leaks its existence and its id.
- **Permission masks are bigint, and JSON cannot carry them.** They travel as
  decimal strings. `drizzle-kit` also cannot serialize a bigint column default,
  which is why defaults use ``sql`0` `` rather than `0n`.
- **Anything that changes which category a channel is in must invalidate the
  permission cache.** The category is a permission layer, so moving a channel
  or deleting a category changes who can see what although no overwrite was
  touched. Both call sites do it; a third one will be easy to forget.
- **`npm run test:smoke` needs an unseeded server.** It registers its own
  accounts and the sign-up rate limiter counts the seed's four against it.
  Restart, then smoke; seed only when you want the client populated.
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
