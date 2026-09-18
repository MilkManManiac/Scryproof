# GoOffline handoff

Living state. Update this at the end of every working session.

**Last updated:** 2026-09-18, after the categories-and-unread session. M5 before that: reactions, mentions, replies, unread marks, links, the keyboard and the sounds.

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
| M0 infra | **Not started, but prepared.** Needs a droplet, which needs Wes to buy one. The production build is rehearsed locally; the box scripts, bonesdeploy runtime and runbook are written and **unverified**, because none of them has run on a box. |
| M1 text skeleton | **Done. Runs locally, end to end.** |
| M2 roles and permissions | **Done.** Server, settings UI, hierarchy reordering, category permissions, audit log. Covered by tests. |
| M3 voice | **Three browsers hold an encrypted call against a local LiveKit, and a test proves it** (`npm run test:voice`, 28 checks). Voice settings exist: microphone and speaker choice, a live meter, always-on / threshold / push-to-talk, per-person volume to 200%, join and leave chimes (`docs/shots/voice-settings.png`). **Not done:** never on a real box, no TURN path tested, three participants at most. |
| M4 video and screen share | **Works locally, encrypted, and tested.** Camera and screen share (1080p at 30, with the shared sound kept apart from the voice clean-up) go through the same per-person keys as the microphone: the test shows pictures decoding with the right key and **zero frames with the wrong one while packets keep arriving**. A share from someone else takes over the stage; click any picture to enlarge it; full screen works. Camera choice is in the voice settings. `docs/shots/voice-video.png`, `docs/shots/voice-video-tiles.png`. **Not done:** never on a real box; the headless test shares a fake source, so a real game capture, shared system sound, and the echo guard (`restrictOwnAudio`, Chromium only) are untested until a person tries them; no per-stream quality choice. |
| M5 feel | **Built, unjudged.** Reactions, mentions, replies, unread marks and mention badges, the line saying where you stopped and a bar that gets you to it, link handling, the quick switcher and the keyboard, message sounds. Everything in the milestone exists and is covered by tests. It is not done: M5 ends when Wes says it does not feel like a clone, and he has not looked at it yet. |
| M6 desktop | Not started. |
| M7 text end-to-end encryption | Schema and wire format ready. The device identity keys built for M3 are the ones this needs, so half of it is already paid for. |

**Repo:** https://github.com/MilkManManiac/GoOffline (private)

## Found on 2026-09-17, late: LiveKit hands out Google and Twilio STUN by default

With `rtc.stun_servers` unset, LiveKit tells every browser to use
`stun.l.google.com`, `stun1.l.google.com` and `global.stun.twilio.com`. Each
caller's IP would have gone to both companies at the start of every call
(non-negotiable 1). `livekit.dev.yaml`, `livekit.yaml.template` and
`60-livekit-install.sh` now set it to ourselves. `npm run test:voice` reads the
ICE servers the browser was really given and fails on any that is not ours. The
production value (`<domain>:3478`, the embedded TURN port answering STUN) is
**unverified** until M0: run the check against the real box.

Trap: with NordVPN connected, two programs on this PC cannot reach each other
over the machine's network addresses, and a local call fails with "could not
establish pc connection". The test browsers now run with
`--allow-loopback-in-peer-connection`. A normal browser on this PC talking to
the local LiveKit will still fail while the VPN is on; against the real box it
is not an issue.

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
npm test            # 108 server + 83 web assertions. No server needed, about a second.
npm run test:smoke  # 75 assertions over the real HTTP surface, and the gateway socket
npm run test:exif   # a real headless browser; needs the web dev server on :5173
npm run test:prod   # builds the production bundle and drives it through a stand-in for nginx
npm run test:voice  # two headless browsers in a real encrypted call
```

`npm test` covers the permission algebra, the image scrubber's decisions and
the whole voice key agreement including a gateway that cheats. `test:exif` is
the one thing Node cannot do: the canvas round trip that actually removes the
metadata.

`npm run test:prod` needs nothing running. It builds the server and client as
they ship, starts them behind a small proxy that reads its headers out of our
real nginx template, signs up in a headless browser and fails on any CSP
violation. Thirteen checks.

`npm run test:voice` needs the API restarted and seeded, the web dev server,
and `npm run dev:livekit` (LiveKit 1.13.6, a Windows binary in the gitignored
`.tools/livekit/`). The test browsers use Chrome's fake microphone, which
beeps, and they run with `--mute-audio` because headless Chrome plays a call
out of the real speakers. Without that flag Wes hears thirty seconds of beeping.

`npm test` now covers the message-body split (links and mentions in one pass,
and every scheme that must never become a link) and the rule for when a message
makes a sound.

`npm run test:smoke` needs a server that has just been restarted and **not**
seeded — it registers its own accounts, and the sign-up rate limiter counts the
seed's four against it.

`node scripts/shot.mjs docs/shots/x.png --as wes --channel maps` signs in and
photographs the app; `--click <selector>` (repeatable, in order), `--hover
<selector>` and `--press ctrl+k` reach a screen that only opens on an action or
under the pointer. Needs the API, the web dev server and a seeded database.

## Screenshots

![The app](shots/app.png)

![Sign in](shots/signin.png)

![Role permissions](shots/settings-roles.png)

![Channel permission overwrites](shots/settings-channel-permissions.png)

![Audit log](shots/settings-audit-log.png)

![The role hierarchy, seen by a moderator who cannot reach the top of it](shots/settings-role-order.png)

![Category permissions: denying View channel here hides every channel beneath it](shots/settings-category-permissions.png)

![An encrypted call between two browsers, with the verification code open](shots/voice-call.png)

![The production build behind the shipping security headers](shots/prod-check.png)

![Unread channels, mention badges and the rail count](shots/m5-unread.png)

![The quick switcher, unread first](shots/m5-switcher.png)

![Every shortcut, in the only place they are written down](shots/m5-keyboard.png)

![What makes a sound](shots/m5-notifications.png)

![The backlog you have not read, and the way up to it](shots/m5-unread-bar.png)

![Jumping to the line, which then puts the bar away](shots/m5-unread-jump.png)

![Categories are something you can make now](shots/m5-categories.png)

![A category's permissions, reached from its own heading](shots/m5-category-permissions.png)

## Found on 2026-09-18, later: voice presence went to everyone

Swept every broadcast for the shape of the two category leaks and found a third.
`voice_state_update` went to the whole server carrying the channel id, so a
member who could not see a private voice channel still learned it existed, who
was sitting in it, whether they were muted and whether their camera was on. The
traps list below already forbids this — a channel a member cannot view must
report "does not exist" everywhere, including the gateway — and it is call
metadata besides (GAMEPLAN 1b, finding 4).

Three places, and the third is the one that would have been missed: the live
event, the **ready frame on every connect**, and the **REST voice-states
endpoint**. All scoped now. The ready frame reuses the channel list it has
already filtered; the endpoint calls the same `visibleChannelIds` the detail
builder uses, so there is one definition rather than two that drift.

A departure is the subtle half: leaving says `channelId: null`, which names no
channel, so the scope has to come from the channel being *left*.
`clearVoiceStatesForUser` returns that now instead of discarding it. Five tests
over `announceVoiceState`, three confirmed to fail when the old broadcast is put
back.

This opened one gap and closed it: presence for a channel you have just been
given access to never arrives, because nobody moved. The client refetches voice
states on `permissions_stale` now, the way it already refetches the server.

The rest of the sweep found nothing. Roles, members and presence go to the whole
server by design and match what the ready frame already sends.

**Proven over the wire, not only in the hub harness.** The smoke test opens
real gateway sockets now (`Actor.socket()`), which is the one thing the REST
surface could not drive. Presence needs no media server, so this runs without
LiveKit: the owner joins a hidden voice channel with the camera on, and the
friend's socket hears nothing, the friend's fresh connect carries nothing, and
the voice-states endpoint returns nothing — then opening the channel makes the
person already in it appear, and a departure from a re-hidden channel reaches
the owner and not the friend. Eleven checks; two of them fail when the old
broadcast is put back. What is still untested is a **real call** on the real
box with three people, which was true before this and is M3's exit.

## Done on 2026-09-18: categories, and getting to the unread line

**The server told every member every category name.** Channels have always been
filtered by VIEW_CHANNEL, with a comment saying why — the name alone is
information — and categories sat one line above it unfiltered. A heading called
"staff-only" announced precisely what denying the channels beneath it was for.
They are filtered the same way now: you are told about a category when you can
see something in it, or when you may manage channels, because the empty one you
just made is yours to fill. `canSeeCategory` is the single rule, used by the
ready frame and by the three gateway events, so a category cannot arrive over
the socket that a reconnect would then take away. Deleting a category
invalidates permissions **before** announcing the orphaned channels, not after,
so those updates are addressed by who can see them now.

Verified against the running server, not by reading it: a member is told about a
category the moment a channel they can see lands in it, and stops being told the
moment it is locked, while the owner sees it throughout. Two smoke checks pin it.

**Categories were unreachable.** Full server API, no interface, and server
settings told you to "create one from the channel sidebar" — which the sidebar
could not do. Now the + is a menu, every heading carries a gear and a +, a
category has its own settings screen using the same overwrite editor one level
up, and a channel can be moved between categories from its own settings. An
empty category shows a line explaining why only managers can see it.

**The unread line was unreachable too.** It has been drawn since M5 and on any
channel with more than a screenful of backlog nobody had ever seen it: opening a
channel lands you at the newest message and leaves the line above the fold. A
bar at the top now says how many are new, jumps to the line, and offers Mark
read. It disappears once the line is on screen, watched with an
IntersectionObserver rather than measured on every scroll.

Two bugs found by looking at it. The line **never appeared for anyone who had
not read the channel before** — a read mark with no id, which is the normal
state of an unopened channel and the state of every seeded account, was read as
"nothing is new" while the badge beside it insisted the channel was unread. And
the bar said "jump to where you stopped" to people who had never started. The
rule now lives in `web/src/lib/unread-line.ts` as a pure function with eight
tests, for the same reason `soundFor` does: the badge and the line must never
disagree.

**The Embed links permission described link previews**, which this app
deliberately does not have. The row says so now instead.

**The seed has a real backlog in #session-planning**, because a feature nobody
can see in the seeded state is a feature nobody checks. `scripts/shot.mjs` takes
repeated `--click` and a `--hover`, because half these controls only exist under
the pointer and a screenshot that cannot show them cannot be used to check them.

## Done in the M5 session

**Reactions, mentions, replies and read marks.** Reactions are one row per
person per emoji per message, so a double click changes nothing the second
time, and every change answers with the message's whole set. Mentions are
resolved by the server when the message is written: an id that is not a member
is noise, nobody pings themselves, `@everyone` is a permission rather than a
string, and a ping only reaches someone who can already see the channel —
otherwise an unread badge would announce that a hidden channel exists and that
people in it are talking about you. **In an encrypted channel the server pings
nobody**, because it cannot read the body and will not guess. Editing
re-resolves who a message names but rings no bells.

Read marks live on the server, so they follow a person between devices, and
reading never goes backwards. Channels carry `last_message_id`, so painting a
whole sidebar costs no extra query.

**Links are only ever links.** Only http and https are turned into something
clickable; every other scheme comes out as flat text, which is the defence,
because `javascript:` and `data:` are how a body becomes code. A bare `www.`
gets https, never http. Every link opens with no referrer. **Nothing is fetched
to make a preview** — an unfurl puts a third party in the data path whichever
end does the asking (non-negotiable 1).

**The keyboard.** Ctrl+K goes to a channel by letters in order, searching only
what the client already holds, so no keystroke leaves the machine. Alt+arrows
walk channels and servers; stepping onto a voice channel selects it and never
joins it. Escape marks read, Up in an empty composer edits your last message,
Ctrl+Shift+K lists all of it. One rule underneath: a key pressed while someone
is typing belongs to what they are typing.

**Sounds.** Two sine tones for a mention, one quiet note for everything else,
made on the spot like the call chimes — no audio files. The decision of whether
to make a noise is a pure function with tests, because a client that pings on
everything gets muted and one that misses the message addressed to you is why
people go back. A burst is one sound, not one each. The tab title carries the
mention count.

**What is not done.** Wes has not used any of it. M5's finish line is his
verdict, not a passing test.

## Done in the voice session

Wes asked for everything that could be finished before he buys the droplet.
Two halves: get the deploy ready, and build voice against a local LiveKit.

**The production build had never started, and now it is rehearsed.** The first
attempt to run the bundle failed twice: the workspace package was left out of
it, and the migrations path only worked from source. Both fixed
(`server/build.mjs`, `findMigrations()`). `npm run test:prod` now does the whole
thing on every run: 13 checks, under the CSP we will ship, with the WebSocket
going through the proxy. Planting an inline script fails it.

**The client IP can no longer be forged.** `server/src/lib/client-ip.ts` reads
`X-Forwarded-For` from the right, skips loopback and non-addresses, and only
believes the header at all when the socket peer is local. Fastify's
`trustProxy` is off. Twelve tests, and `test:prod` checks that a forged header
does not dodge the rate limiter.

**bonesdeploy's source was read before any box exists** (v0.8.7, read-only
clone, never installed). What it found is in `docs/for-alex.md`, written for
Wes to send, with `docs/bonesdeploy-router.patch`. **The patch is untested.**
The short version: neither nginx layer passes WebSocket upgrades, the body cap
is 1 MB, the access log is on, the AppArmor profile would stop argon2 loading,
`init` overwrites our runtime files, and `server setup` reopens outbound
traffic. One thing we had wrong: the stock next and nuxt kits already use
`npm ci`; only the generic, sveltekit and vue kits use `npm install`.

**The deploy and box scripts are written. None has ever run on a box.**
`infra/custom/` is the bonesdeploy runtime, manifest, nginx template and
AppArmor profile. `infra/box/remote/` is the vault, the gated services, the
firewall, host hygiene, unlock and lock, and a LiveKit installer.
`scripts/box.sh` and `scripts/unlock.sh` run them from Wes's PC. The shell
scripts pass `bash -n` and that is the whole of what is known about them. The
runbook is `infra/box/README.md`. Treat every line as **unverified** until M0.

**The gateway relays voice keys without being able to read them.** It counts
epochs, sends `voice_membership` to the people in a channel on every join and
leave, and carries `voice_signal` envelopes between them. It refuses senders
who are not in the room, recipients who are not in the room, any epoch but the
current one, oversized envelopes and wrong shapes. Seventeen tests, and three
sabotages each fail them. One call per person: joining a channel on one server
leaves any call on another.

**A made-up device no longer slips past the pin.** Pins were per device, so a
relay inventing a fresh device id for someone already known got treated as
first contact. There is a `new-device` verdict now, and the call holds such a
device: no key is sent to it, its key is refused, it is left out of the
verification code, and a banner names the person and says what approving
means. Ten tests.

**The key provider would have thrown on the first frame.** LiveKit's worker
rejects raw AES-GCM keys; it wants HKDF or PBKDF2 material and derives the rest
itself. The import is HKDF now. Found by reading LiveKit's worker, confirmed by
the call test.

**The voice session, the call screen, and a test that holds a real call.**
`web/src/lib/voice-session.ts` and `web/src/components/VoicePanel.tsx`. The
panel says "encrypted" only when LiveKit reports E2EE on and every person shown
as secured is one whose key this device verified. Numbers that have not been
measured print a dash.

`npm run test:voice` passed all 19 checks on 2026-09-17 against the local
LiveKit: both sides secured, the same twenty-digit code on both, first contact
labelled as first contact, decoded audio energy climbing, measured stats in the
panel, a rotation when one leaves and rejoins, `known` the second time. The
sabotage is the one that matters: hand one side the wrong key and the packets
keep arriving while decoded energy stays at exactly zero. A third browser then
joins: all three hold one another's keys and agree on a new code, the newcomer
decodes both others, and when she leaves the two who stay rotate again.

**The bug that test found.** Its first run failed with one side secured and the
other stuck on "Securing..." for ever. Each handler awaits real cryptography
and nothing put them in order, so a wrapped key overtook the announcement sent
just before it, met a sender it had not admitted yet, and was thrown away. All
voice events now go through one in-order queue in `voice-session.ts`. No unit
test would have caught it; it needed two real browsers.

## Done in the security-review session

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

1. **Wes buys the droplet and a domain.** 2 GB / 1 vCPU, a 10 GB volume,
   ATL1, Ubuntu 24.04, the SSH key named `gooffline`, no backups and no
   monitoring agent. Resize later with "CPU and RAM only" so it stays
   reversible. Domain from Porkbun or Namecheap. He sends a screenshot of the
   droplet page for the address.
2. **M0 infra, by the runbook** (`infra/box/README.md`). Every script in it is
   unverified, so expect to fix them as they run. Four things the runbook says
   that are easy to lose:
   - rerun `40-firewall.sh` after `bonesdeploy server setup`, which sets ufw
     back to allowing all outbound;
   - run `git checkout infra/custom` after `bonesdeploy init`, which overwrites
     `runtime.py` and `manifest.py` with stubs;
   - `web_root` must be `web/dist`, the only part of the release nginx's
     AppArmor profile may read;
   - a 2 GB box with swap off may run out of memory during the build. The
     runbook lists the ways out.

   Installing the bonesdeploy CLI needs Rust on Wes's PC. Ask him first.
3. **M3 on the real box.** The TURN path has never carried a call, nothing has
   been tried with three people, and a `device_keys` table still has to replace
   `users.identity_key`. Then video and screen share (M4).
4. **Reordering.** Categories and channels both carry a `position` the server
   will accept a change to, and there is no way to change it from the client.
   New ones go to the bottom. The role list already has a drag-and-arrow-key
   reorder to copy from.

## Decisions made this session

- **LiveKit's embedded TURN, not coturn.** Credentials are per session and
  issued by LiveKit, and it is one less daemon to gate behind the vault. Same
  ports. Recorded in GAMEPLAN as a deviation.
- **LiveKit's signalling goes through nginx at `/rtc`, same origin.** The CSP
  stays `connect-src 'self'` with no second hostname in it.
- **The box's media address is read off its own network card.** LiveKit's
  default is to ask a Google STUN server. That is a third party, and our
  outbound firewall would block it anyway.
- **A new device for a known person is held until a human approves it.** First
  contact is still trusted on first use; a second device is not.
- **Voice events are handled strictly one at a time.** Slower by nothing anyone
  can measure, and the alternative loses keys.
- **LiveKit 1.13.6, not the three-day-old 1.13.7.** The same seven-day hold we
  apply to npm. The Windows binary's SHA-256 was checked; the Linux one has not
  been, and the installer refuses to run until its hash is filled in.
- **Not the reel-rival box.** LUKS, reboots and an outbound deny cannot be
  rehearsed on a machine that is serving something else.

## Decisions made building voice encryption

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

- **Voice has only ever run on one PC.** Two browsers, one local LiveKit, no
  NAT, no TURN, no packet loss. RTT 1 ms proves nothing about Atlanta.
- **Headless Chrome plays audio out of the real speakers.** Any new browser
  test that joins a call needs `--mute-audio`.
- **A declined command may already be running.** Twice Wes declined
  `test:voice` and the process carried on in the background. After a decline,
  look for the process before saying it never ran.
- **Long Bash heredocs with apostrophes fail in this Git Bash.** Use the Write
  tool for files like that. `.gitattributes` pins LF for the box scripts
  because they are piped over SSH.
- **LiveKit identifies participants by the token's `identity`, which is the
  bare user id.** Two devices for one person collide there. A call is one
  device per person until that is solved, and the key agreement already carries
  device ids for when it is.
- **Do not add a "call history" table.** Voice presence is in memory and stays
  there. GAMEPLAN 1b, finding 4.
- **Voice presence is scoped to the channel, and a departure carries no channel
  id.** Anything new that announces a voice state must pass the channel it is
  *about* — the one joined, or the one just left — not the `channelId` on the
  wire, which is null on the way out. `hub.announceVoiceState` is the only way
  in; do not reach for `broadcastToServer`.
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
- For Alex: answered by reading the source. It does not pass WebSocket
  upgrades, in either nginx layer. `docs/for-alex.md` is the note to send him;
  sending it is Wes's call.
- The droplet. Local work that does not need a box is close to used up.
