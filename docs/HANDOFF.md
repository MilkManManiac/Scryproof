# Scryproof handoff

Living state. Update this at the end of every working session.

**Last updated:** 2026-09-29. **LIVE 2026-09-29 12:18 ET (client 1790698620598): How to play on every game, the stuck line in Queefs, the Travhole map zoom; see the last section. Proven live: health ok, the served client has the new entry. Not proven: pinch and drag on a real phone.** **LIVE 2026-09-29 10:15 ET (client 1790691230334): Smelling Pee, Queefs, Travhole, Threeway, the Games folder, and stock into January for every game; see the last two sections. Proven live: all four new routes answer, migrations 0030 and 0031 tables are on the box, the served client has the new games and the What's new entry. Not proven: nobody has played them signed in on the live site, and Queefs drag is untested on a real phone. The first deploy attempt at 09:53 froze the live site for 18 minutes; see the last section.** **LIVE 2026-09-29 00:47 ET (client 1790657124564): Cuntections, All time boards for both games, and the jump limit on pasted jumps; see the last section. Proven live: route answers, migration 0029 tables on the box, service clean. Matt has root on the box as of tonight.** **LIVE 2026-09-28 01:32 ET (client 1790573422315, not in What's new by Wes's choice): Remove from Scryproof** (Wes: "how do i kick someone from the app"). Host only (`canCreateServers`), on the member list's ⋯ menu, two clicks. `POST /api/host/remove-account` (`routes/host.ts`): sets `users.disabled_at`, revokes every session, drops push subscriptions, kicks from every server (a `kicks` row + `member.kick` audit entry with `removedFromScryproof`), clears every call, closes their sockets with 4001. Refuses anyone who owns a server. No undo button: to let someone back, clear `disabled_at` on the box and send a new invite. `docs/shots/remove-from-scryproof.png`. **LIVE 2026-09-27 21:39 ET (client 1790559469311): phones are woken even while their person is at a computer (Wes: "make it go through unless they select otherwise"). Per-phone switch "Even while I am on my computer", default on (migration 0028, `push_subscriptions.even_while_attending`). A phone is never woken while it is itself the window being looked at (`hub.attendingSessions`). `hub.isAttending` is gone.** **LIVE 2026-09-26 19:39 ET (client 1790465874389): phone notifications (VAPID keys made on the box by `90-push-keys.sh`; phones default to mentions and DMs). Not yet proven on a real phone. LIVE 19:47 ET (client 1790466364455): the Guide (`components/Guide.tsx`, your name → Guide, `?guide=phone` links) and press-and-hold to mute a channel or server on a phone.** **LIVE 2026-09-26 05:33 ET (client 1790415064384, shell 0.5.4 published, installer sha256 108d50aea0cf750d43de47dab46546afeacf8c004f3e6b9916e268f24938c2b7): the loudness guard on every microphone and every voice, Strong noise suppression really running in calls (it never had been, see the last section), Loaf v2, the Discord-style bottom bar with the voice dock and soundboard, and the mute work.** Before that, **LIVE 2026-09-25 21:14 ET (client 1790385137643): Strong noise suppression (RNNoise on each person's device) and the voice settings dropdown fix; see the last section. Desktop app needs shell 0.5.4 for Strong.** **LIVE 2026-09-25 16:50 ET (client 1790369344331): the sound clipper (migration 0023, `sounds.volume` confirmed on the box) and the one-time walkthrough.** Earlier, **LIVE 2026-09-25 13:53 ET: Trey's E2EE PR with the review fixes, soundboard volume, 15 s clips, the What's new card, and shell 0.5.3** (installer sha256 8dfd880a3f4b66884560e66680c54ba5a085a9b3f1dd89b136552e23cb7f33fa); Wes confirmed his app offered and installed 0.5.3. Before that: **LIVE 2026-09-24 17:37 ET (client 1790285738681): six authorization fixes, four found by Alex testing the live site** (join-by-id route removed, account invites host-only, channel move and member overwrites scoped to the server, profiles and avatars only for people who share a server). Proven live: the old join route now returns 404. **Next week starts with the full route audit, see `BUILD-ORDER.md`.** Earlier today: **LIVE 2026-09-24 17:03 ET (client 1790283703641, shell 0.5.2 unchanged): who messaged you (faces under the DM button, counts in the member list), the profile card opens ready to type, and messages that expire per channel (migration 0022 applied; `expire_after_seconds` confirmed on the box).** Deployed with four people connected and no call open; the restart took five seconds. The Hearth voice bridge is built and pushed but ON HOLD until Wes asks the players whether they want music-only or recording too (see `BUILD-ORDER.md`). Before that: **The push: encrypted channels stages 1 to 3, the group DM sender fix, the share picker (shell 0.5.2), the full emoji browser and Wes's notes: LIVE 2026-09-23 12:58 ET** (client 1790180431870, shell 0.5.2 published; last two sections). The box now has swap on the vault (see the last section): two build attempts froze the live site for a few minutes before it did. Next: the M7 proof with Wes. Before that: **Batch five is live** (last section; client 1790139149928, installer 0.5.1 on /download): group DMs, DM calls, emoji search, the shell updating itself, Electron fuses. The self-update was proven on Wes's PC: 0.5.0 by hand, then 0.5.1 downloaded, verified and installed itself; Wes: "seemed to work like you explained". Before that, **batch four is live** (client 1790135803188, installer 0.4.0 on /download), with the password reset and jump-again-for-everyone. Everyone has to run the new installer once for the right-click menu, share-sound choice and interface scale. Wes: nothing deploys without asking him first; he may batch several. Before that, Session A: nightly encrypted backups are running with a restore proven, and the password reset is built. **Wes: nothing deploys without asking him first; he may batch several.** Before that: **next session reads `docs/BUILD-ORDER.md`**: the ranked list of what to build next, from the group's Discord suggestions and the security gaps, with the code facts already checked. Before that: The big one is live (client 1790124190233, last section): polls, events, saved, invite links, voice messages, soundboard, voice changers, initiative, commands in DMs, Delete channel, and the jump-for-everyone fix. Before that, commands and the Meepo characters went live; Wes: "Just jump is fine." Live today: ridge default, the formatting pass, the speaking ring and sharing marks, per-watcher video quality, the moving theme, the house rule, the second batch from lamp's notes (profile card, picture viewer, text styles, phone drawers, installable), the night push (What's new, the dusk theme, the join fix), and Loaf and Forg; see the last four sections.

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
| M0 infra | **Done.** Live at https://scryproof.com. Every runbook script has run for real, including unlock after a reboot. bonesdeploy from WSL, TLS from Let's Encrypt, LiveKit with TURN over TLS, every secret-holding service gated behind the vault, firewall default-deny both ways. The owner account exists (Wes, 2026-09-21). |
| M1 text skeleton | **Done. Runs locally, end to end.** |
| M2 roles and permissions | **Done.** Server, settings UI, hierarchy reordering, category permissions, audit log. Covered by tests. |
| M3 voice | **Three browsers hold an encrypted call against a local LiveKit, and a test proves it** (`npm run test:voice`, 28 checks). Voice settings exist: microphone and speaker choice, a live meter, always-on / threshold / push-to-talk, per-person volume to 200%, join and leave chimes (`docs/shots/voice-settings.png`). **First real use, 2026-09-21:** Wes and a friend on scryproof.com, voice "works great". **Not done:** nobody looked at the connection panel, so whether that call went direct or over TURN is unknown; three participants at most. |
| M4 video and screen share | **Works locally, encrypted, and tested.** Camera and screen share (1080p at 30, with the shared sound kept apart from the voice clean-up) go through the same per-person keys as the microphone: the test shows pictures decoding with the right key and **zero frames with the wrong one while packets keep arriving**. A share from someone else takes over the stage; click any picture to enlarge it; full screen works. Camera choice is in the voice settings. `docs/shots/voice-video.png`, `docs/shots/voice-video-tiles.png`. **First real use, 2026-09-21:** camera and screen share both worked for Wes and a friend on the box. **Not done:** the headless test shares a fake source, so a real game capture, shared system sound, and the echo guard (`restrictOwnAudio`, Chromium only) are untested until a person tries them; no per-stream quality choice. |
| M5 feel | **Built, unjudged.** Reactions, mentions, replies, unread marks and mention badges, the line saying where you stopped and a bar that gets you to it, link handling, the quick switcher and the keyboard, message sounds. Everything in the milestone exists and is covered by tests. **Judged on 2026-09-21: not done.** Wes used it for real and said "some of the UI is kind of funky" and "we'll definitely need a good UI pass". No specifics yet; he offered screenshots. Read `references/the-wall.md` in the milk-project skill before starting that pass. |
| M6 desktop | **A working shell with an installer, 2026-09-21.** Electron. Signs in, connects, uploads; `npm run test:desktop`. Not yet: tray, push-to-talk, notifications, signed updates. See "The desktop app, moved up". |
| M7 text end-to-end encryption | **Stages 1-3 live 2026-09-23.** Proof screenshot of ciphertext rows still owed (below). DMs were already encrypted. Text channels can now be made end-to-end encrypted: epoch keys made on members' devices, handed device to device, retired when someone loses access, every message signed. Proven in real browsers (`npm run test:channels`). Stage 2: files and voice messages. Stage 3: switch encryption on for an existing channel. |

**Repo:** https://github.com/MilkManManiac/Scryproof (private)

## M0 so far (2026-09-21)

![The live site, first run](shots/m0-live.png)

**Renamed GoOffline to Scryproof on 2026-09-21**, at Wes's word: packages, UI,
scripts, docs, the GitHub repo (`MilkManManiac/Scryproof`), the SSH key
(`~/.ssh/scryproof`), the vault labels, everything on the box. Still carrying
the old name, because only Wes can change them: the droplet and the volume in
the DigitalOcean panel (both cosmetic; the scripts find the volume without its
name), and the project folder on his PC, which cannot be renamed from inside a
session running in it. `docs/for-alex.md` keeps the old name because it is the
note as sent.

- **The box:** DigitalOcean droplet (named `GoOffline` in the panel), **NYC1**,
  Ubuntu 24.04, **1 GB / 1 vCPU, $6**. IPv4 `68.183.16.145`, in the gitignored
  `.env.box`. 1 GB turned out to be enough for everything including the build;
  about 500 MB in use at rest with LiveKit running.
- **The domain: `scryproof.com`**, Cloudflare Registrar, one A record, **DNS
  only (grey cloud)**. If it ever resolves to a Cloudflare address, someone
  turned the proxy on and non-negotiable 1 is broken.
- **Vault:** LUKS2 on the 10 GB volume, label `scryproof-vault`, argon2id
  capped at 256 MB. Passphrase in Wes's Bitwarden and nowhere else. Header
  backup at `Documents\Scryproof-keep\` on his PC (taken before the label
  change; it still restores the keyslots, it would only put the old label
  back). `/mnt/vault` is 711 so the livekit user can reach its config;
  `binds/` under it is 700.
- **Bound onto the vault before anything was installed:** `/srv/sites`,
  `/srv/conf`, `/var/lib/postgresql`, `/etc/ssl/private`, `/etc/letsencrypt`.
- **Every box script has now really run:** `00`, `50`, `10`, `20`, `40`, `60`,
  `30`. Fixes along the way: a missing `mkdir` (50), a chmod before the mount
  and then 700 where 711 was needed (10), and 60 now writes LiveKit's key and
  secret straight into the app's `.env` instead of printing them, and installs
  a certbot deploy hook that copies the certificate to where the livekit user
  can read it. Never yet run: `scryproof-unlock` and `scryproof-lock`.
- **bonesdeploy runs from WSL** (Wes allowed it). Ubuntu 26.04 in WSL2, Rust
  and the CLI at v0.8.7 inside it, nothing on the Windows side. The CLI cannot
  work on the Windows drive, so there is a second clone at `~/scryproof` in WSL
  whose `origin` is the Windows repo. Drive it from a session with
  `wsl.exe -d Ubuntu -- bash -lc '. ~/.cargo/env; cd ~/scryproof && ...'`
  (root, no password: `wsl.exe -d Ubuntu -u root`). Shell variables get eaten
  on the way through `wsl.exe ... bash -lc`, and `\\` collapses in Git Bash
  heredocs: put anything non-trivial in a script file and run that.
  - **To ship:** commit here, then `bash ~/ship.sh` in WSL. It pulls from the
    Windows repo, pushes to the box, deploys, and logs to `~/deploy.log`.
  - **After changing anything under `infra/`:** `bonesdeploy site runtime --yes`
    reapplies nginx, units and profiles without a deploy.
  - **If the Windows project folder is renamed**, fix the WSL clone's origin:
    `git -C ~/scryproof remote set-url origin /mnt/c/Users/weshu/CodeProjects/<new>`.
- **`init` only scaffolds when there is no `infra/` folder.** Move `infra/`
  aside, init, put ours back, `git checkout -- .`. It writes the provisioning
  engine into `infra/.framework/` (committed; that copy is what runs). Its
  config is the gitignored root `.env` in the WSL clone.
- **Seven files in `infra/.framework/` are patched** and `bonesdeploy update`
  would wipe them: Postgres provisioning (two bugs), `/etc/ssl/private` mode,
  `aa-enforce` on Ubuntu 24.04, and in the router: WebSocket upgrades, 110 MB
  bodies, HTTP to HTTPS redirect, no access log. `docs/bonesdeploy-fixes.patch`
  is the whole diff; reapply it after any update.
- **For Alex:** `docs/for-alex.md` was sent on 2026-09-21 and two of its claims
  were wrong. `docs/for-alex-followup.md` plus `docs/bonesdeploy-fixes.patch`
  is the one follow-up, written to need no reply. Whether and when it goes is
  Wes's call. `docs/for-alex-updates.md` is the raw log behind it.
- **The app's `.env` is on the box, on the vault**, at
  `/srv/sites/scryproof/shared/.env`, root:scryproof 0640: `NODE_ENV`,
  `PUBLIC_URL`, `DATABASE_URL`, `SESSION_SECRET` (made on the box), and the
  three LiveKit lines. No value passed through a session. **Never run
  `bonesdeploy secrets push`**: it replaces that file with the tool's own,
  which has none of ours. The Postgres password also sits GPG-encrypted in the
  WSL clone (`infra/secrets/.env.gpg`, gitignored), because `site setup` needs
  it; the database only listens on loopback.
- **Gated behind the vault, in start order** (`/etc/scryproof/units.list`):
  the journal archive, livekit, `postgresql@16-main`, `postgresql`, `nginx`,
  `scryproof-nginx`, `scryproof-scryproof`, `scryproof.target`, `certbot.timer`.
  A locked box answers on SSH and nothing else.
- **Firewall on and tested:** inbound deny, outbound deny with logging. Only
  `server setup` resets outbound to allow; rerun `40-firewall.sh 22` after it.
- **Checked from outside:** HTTP redirects to HTTPS; `/api/health` answers; a
  WebSocket handshake reaches the app at `/gateway` and LiveKit at `/rtc`; a
  2 MB body gets through; the router writes no access log.
- **On the root disk, not the vault:** `/home/git/scryproof.git` (source, no
  secrets), `/root/.config/bonesremote/`, `/var/log/bonesdeploy/`, and nginx's
  `error.log`, which can hold client IPs. Looked at, nothing secret found;
  `error.log` is worth a second thought.

### The reboot test (2026-09-21), passed on the second run

![Unlock after a reboot](shots/m0-unlock.png)

Rebooted twice. Locked, the box is what it should be: SSH answers in about 30
seconds, `/dev/mapper/vault` does not exist, every gated unit is inactive,
port 22 is the only listener, HTTPS gets no answer from outside, and nothing
is written under the five bind points. Wes unlocked it from his own Git Bash
with `bash scripts/unlock.sh`; the passphrase never passed through a session.

The first run found two bugs, both fixed and proven by the second:

- **Ubuntu's `ssl-cert.service` regenerates the snakeoil key pair at boot when
  the key is missing**, and on a locked box `/etc/ssl/private` is the bare
  root-disk directory, so it always is. That left a key where the vault binds
  (unlock refuses a non-empty directory), and a new certificate in
  `/etc/ssl/certs` that no longer matched the key on the vault, so Postgres
  would not start: "key values mismatch". Now masked by `30-gate-services.sh`.
  If it ever recurs: `make-ssl-cert generate-default-snakeoil --force-overwrite`
  with the vault open.
- **`scryproof-unlock` asked the API for its health once, immediately**, and
  reported failure on a box that was fine five seconds later. It now waits up
  to 30 seconds.

`scryproof-lock` has still never been run.

### What is left

1. **Look at the connection panel during a call** and note direct or TURN.
   The first real call happened on 2026-09-21 and nobody checked.
2. **After any reboot the site is down until Wes unlocks it.** That is the
   design. DigitalOcean reboots droplets for maintenance now and then, with
   notice by email.

## First real session on the box (2026-09-21)

Wes made the owner account, invited a friend with a server invite link, and
they used it: "Seems to be working very well." Text, adding channels, invite
codes, voice, video and screen share all worked.

- **Fixed just before:** registering from a server's invite link made the
  account but did not join the server. `AuthScreen.tsx` now accepts the invite
  after registering. Shipped; the friend's sign-up was its first real test.
- **Still missing:** nothing in the UI mints an account-only invite
  (`api.invites.createInstance` has no caller). A server invite link does the
  job, so nobody is blocked.
- **What he asked for, down the road:** a desktop app (Electron), a UI pass,
  DMs between people who share a server (no friends list), and a full review of
  Discord's features so he can say what matters. That review is
  `docs/discord-features.md`; it is waiting on his answers, and on one real
  decision about whether DMs are encrypted from day one.

## DMs, stage 1: passing locally, shipped 2026-09-21

Wes said go on encrypted DMs. The plan is `docs/dm-plan.md`; what he wants from
Discord overall is `docs/discord-features.md`. `npm run test:dm` passes all 21 checks (`docs/shots/dm-stage1.png`).
**Not done:** no two real people have used it on the box yet.

- **Server:** `server/src/routes/dms.ts`, five new tables (`device_keys`,
  `dm_channels`, `dm_members`, `dm_messages`, `dm_message_keys`), migration
  `0003`. DMs are their own tables on purpose: every channel query starts from
  a server id. The server never sees a body and has no column for one. You can
  DM anyone you share a server with.
- **Crypto:** `web/src/lib/dm-crypto.ts`, 14 tests in
  `web/src/tests/dm-crypto.test.ts`, all passing, including a server that swaps
  keys, moves keys between messages and misattributes authors. Each device has
  a long-lived ECDH key signed by the identity key voice already uses; each
  message gets a fresh key, wrapped once per trusted device, the sender's own
  included. Pins are shared with voice. No forward secrecy yet; that is M7.
- **Client:** `web/src/state/dms.tsx` (its own provider, fed by a new
  `onGatewayEvent` tap in the store), `web/src/components/DirectMessages.tsx`,
  an `@` button at the top of the rail, click a member to message them, a
  warning with Accept when someone has a new or changed device.
- **Browser test:** `npm run test:dm` (three real Chromes; needs `npm run dev`
  and a seeded database). **All 21 pass.** Three bugs on the way: React dev mode
  ran device setup twice and published two half-matched devices (now one shared
  promise); PGlite returns bytea as a plain Uint8Array, so `toString('base64')`
  printed "12,200,7" (now `b64()` in the route); and a headless window never
  has focus, so the test turns on focus emulation before checking read state.
- **Stage 2, part one (2026-09-21, shipped): edit, replies, reactions.** All
  three are content, so all three live inside the sealed body. An edit is the
  author sealing the message again (`PATCH`, old bytes and old keys replaced).
  A reply's target id is in the body; the server never learns it. A reaction is
  its own sealed row with `reaction_to` set (migration `0004`): the server knows
  somebody reacted and to what, not which emoji, and the client drops a reaction
  whose sealed target disagrees with the row it was filed under. Taking one back
  deletes the row. Reactions make no sound and no unread mark. `npm run test:dm`
  is now 34 checks (`docs/shots/dm-stage2.png`).
- **Found on the way:** the quoted line above a reply had zero width, in
  channels too, since `.message` became a grid: the quote took the avatar's
  40px column. Fixed in `styles.css`; the DM test measures it now.
- **Stage 2, part two (2026-09-21, shipped): files.** A file is locked in the
  browser under a key of its own (`sealFile`), the locked bytes are uploaded to
  `POST /api/dms/:dmId/files`, and the name, type, size and key travel inside
  the sealed message. The `dm_files` row (migration `0005`) holds a size and a
  storage key and nothing else. Photos are scrubbed of EXIF first, as in
  channels. Pictures of five known types are opened and drawn in place; anything
  else, SVG included, is a download. 50 MB limit, because a file is locked and
  opened whole in memory. Deleting a message removes its files from the store.
  `npm run test:dm` is 42 checks (`docs/shots/dm-files.png`).
- **Stage 2 is done except notifications.** Desktop notifications do not exist
  anywhere in the app yet; that is build-list item 6 and should cover channels
  and DMs together ("who, not what" for DMs).
- **Small gap:** a file uploaded and then abandoned without clicking its X
  (tab closed) stays in the store unclaimed. Channels have the same gap. A
  sweep of unclaimed rows older than a day would close both.
- **Known gaps, by design for stage 1:** a new device shows older DMs as locked (stage 3 adds the
  recovery phrase); your own second device reads nothing until your first one
  accepts it.
- **Fixed 2026-09-21:** a DM to somebody who has not loaded the site since DMs
  shipped (so has no key) now says exactly that, at the top of the conversation
  and in the send error. Wes hit this with a real friend.

## The desktop app, moved up: a working shell, 2026-09-21

Wes's call: the app is how people will mostly use this, so build it first and
fit everything after it to both. Order now: shell (done) -> notifications,
push-to-talk, tray, stream quality picker (the streamer picks, no cap from us
until it is a problem), recovery phrase -> quick four -> UI pass.

- `desktop/` is **not** a workspace, on purpose: the box's build must never
  download Electron. It has its own `package.json` and lockfile. Electron
  44.4.3, electron-builder 26.15.3, pinned exactly.
- **How it works** (`desktop/src/main.js`, read its header): the client is
  served from inside the installer at `app://scryproof`. `/api/*` on that
  origin is forwarded by the main process to the server with the session
  cookie kept in Electron's jar, so the client code is unchanged: still
  relative paths. **No server change was needed**: no CORS, no SameSite=None.
  The forwarder sends no Origin (the server's CSRF hook allows that, and was
  written expecting it). The gateway socket is opened by the page; a
  `webRequest` hook adds the cookie and strips the Origin on that one URL.
- Client changes, two: `web/src/lib/desktop.ts` gives the gateway URL and the
  public origin for invite links. Everything else is the same build.
- Hardening so far: sandbox, context isolation, no navigation off `app://`,
  links open in the real browser (http/https only), permissions granted to our
  origin only, CSP sent with every file, packaged builds exit if started with a
  debugging switch. **Not yet:** Electron fuses (RunAsNode and friends), signed
  updates (key on Wes's PC, never the box), code signing (costs money: Wes's
  call; without it Windows SmartScreen warns on install).
- Screen share picker is a plain native menu of screens and windows. Works, is
  ugly, gets thumbnails later. With sound = whole-machine audio (loopback).
- `npm run test:desktop` (11 checks): starts the real app against the local API
  and proves sign-in, cookie not readable by the page, still signed in after
  reload, gateway open, a file up and back byte-for-byte, no navigating away.
  Needs `npm run build --workspace web` first. Shot: `docs/shots/desktop-shell.png`.
- Build the installer: `cd desktop && npm run dist` ->
  `desktop/release/Scryproof-Setup-0.1.0.exe` (111 MB, gitignored). The packaged
  app was run against scryproof.com: loads, health ok, login POST reaches the
  server (401 for a bad password, not 403). **Nobody has signed in for real in
  it yet, and voice in it is untested.** That is Wes's first look.
- Trap: the desktop app is a new device to DMs. Old DMs show locked in it until
  stage 3 (recovery phrase). Expected, and the reason stage 3 moved up.
- Trap: an invite link opened in the app does nothing yet (`/invite/<code>`
  is a browser path). Joining by invite still happens in the browser.

## Notifications and the timeline: built and deployed 2026-09-21

Held back while Wes tested on the live site with a friend; he said he was done
and it went out the same evening (release `20260921_230113-bc023b68`). The
installer in his Downloads was rebuilt after it, so it has the tray, the bell
and the quality picker.

- `web/src/lib/notices.ts`: the rules (`noticeFor`), the list, the pop-up.
  Mentions and DMs that arrive while you are not watching go on a list kept in
  this browser only (localStorage, per user, newest 200). With the window in
  the background they also raise an OS pop-up, if switched on in Notifications
  settings (off by default, because the browser has to be asked from a click).
- **DMs: who and when, never what**, in the pop-up and in the list. The list
  sits in plain storage and the OS keeps notification history; neither is a
  place for end-to-end encrypted text. `npm run test:dm` checks the text is
  not on screen and not in storage. Channel previews can be switched off too.
- The timeline (Wes's idea): bell on the rail under the DM button, badge with
  the unread count, list grouped by day with time, server > #channel, who, and
  a row of filters across the top counting how many came from each server.
  Click goes to the message and flashes it. Reading a conversation any other
  way marks its notices read. `web/src/components/NoticeTimeline.tsx`.
  Shot: `docs/shots/notice-timeline.png`.
- Not done: per-server or per-channel mute; replies-to-you are covered only
  because the server already counts them as mentions.
- Desktop app gained a tray icon (closing the window hides to tray; Quit is in
  the tray menu) and the AppUserModelId Windows needs before it shows pop-ups.
  **Pop-ups inside the desktop app are untested by a person.** The installer in
  Wes's Downloads predates this: rebuild with `cd desktop && npm run dist`.
- **Stream quality picker, built, not deployed:** Voice settings > Screen share
  quality. 720p / 1080p / 1440p / full size, at 15 / 30 / 60 frames. The person
  sharing picks; no cap (Wes's call). `screenShareOptions` in `voice-prefs.ts`
  holds the bitrate table, which is where a ceiling would go. Default is what
  it was (1080p30, 5 Mbps). `npm run test:voice` still 28/28. Nobody has looked
  at a real 1440p60 share yet.
- **Global push-to-talk is not started.** Electron's `globalShortcut` has no
  key-up event, so hold-to-talk needs a native key hook (uiohook-napi or
  similar): a native dependency, to be vetted for phoning home before it ships.

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
npm run dev:web                    # client on :5173 (root script; the web workspace has no dev:web)
```

Then open **http://localhost:5173** and sign in as `wes` (or `alex`, `mara`,
`dev`) with the password the seed prints. Those accounts exist only in the
local PGlite database, which `dev-restart.sh` wipes.

`npm run dev` at the root starts the API and the client together.

## Test it

```bash
npm test            # 108 server + 83 web assertions. No server needed, about a second.
npm run test:smoke  # 83 assertions over the real HTTP surface, and the gateway socket
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
<selector>`, `--focus <selector>` then `--press up` (repeatable; goes to the
focused element), and `--then <selector>` for a click after the presses, reach
a screen that only opens on an action or under the pointer. Needs the API, the
web dev server and a seeded database. **The API does not reload on edit**:
restart it before photographing a server change, or you photograph the old
process — that cost twenty minutes on 2026-09-18.

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

![Server settings → Layout: the sidebar's order, with a handle on every row](shots/m5-layout.png)

## Done on 2026-09-20: a finish pass on the whole stylesheet

Wes had no complaint; he asked for the design research from the other projects
to be applied here. The sources were Rise-Automation's
`docs/premium-module-design-system.md` and how-it-ends'
`docs/research-art-direction.md`. Only `web/src/styles.css` changed.

![The composer takes the warm light when you type in it](shots/finish-composer.png)

- **Depth has tokens now.** `--shadow-1/2/3` are layered and tinted with the
  room's blue-black instead of one flat black drop; `--hi` is the one-pixel
  top highlight. Every floating surface (modals, menus, pickers, the switcher,
  the save bar) uses them, so there is one light source, above.
- **Motion has tokens.** `--ease`, `--t-fast` (hover, press), `--t-arrive`
  (things appearing). Floating surfaces arrive with `@keyframes arrive`.
  Buttons and rail items press. The global reduced-motion block still wins.
- **One warm light.** The active server glows, and the composer glows when
  focused. Nothing else does; that is the point.
- **Two tiers of type.** Words in `--font`, anything the machine wrote
  (timestamps) in `--mono` with tabular figures. Message text is capped at
  92ch and uses `text-wrap: pretty`.
- **Grain.** `body::after` is an inline feTurbulence SVG at 5% so big flat
  panels stop banding. It is a `data:` URI, which the CSP's `img-src` allows;
  `test:prod` proves no violation.
- **Fonts: tried, not shipped.** IBM Plex, Figtree and Geist were bundled
  (self-hosted via @fontsource, nothing fetched) and photographed side by
  side. Wes could not tell them from the system font, so the packages came
  back out. Do not reopen this without a reason he can see.
- Rejected on purpose, per the research: magnetic buttons, tilt, shimmer
  headings, confetti.

## Done on 2026-09-18, later still: the sidebar can be rearranged

Server settings → **Layout**. One list in the order the sidebar draws it, a
handle on every category and channel, drag or arrow keys — the role list's
pattern, because two ways of reordering things in one app is one too many.
Moving a channel past a heading moves it into that category, and the note says
what that means: the category's permissions come with it.

`PUT /api/servers/:id/layout` takes the whole order and renumbers underneath
it, like the role reorder and for the same reason (one gesture, one request,
one audit entry). Two rules in it worth knowing: a channel the actor cannot see
is not theirs to arrange, keeps its place, and naming it is answered 404; and
any category change invalidates the permission cache, exactly as
`PATCH /api/channels/:id` does — the pure-reorder case rides the same blunt
refetch because it is rare and the refetch cannot be subtly wrong. Eight smoke
checks, including that a channel moved into a locked category through the
layout disappears for a member, and reappears when moved out.

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

## Profile picture, status line, pins: built 2026-09-21

The "quick four" minus stream quality, which was done earlier.

- `server/src/routes/profile.ts`: `PATCH /api/auth/profile` (displayName,
  statusText), `POST`/`DELETE /api/auth/avatar`, `GET /api/avatars/:userId/:id`
  (signed-in members only; not a public URL). New `avatars` table, `users.status_text`.
  Every change broadcasts a new `user_update` event to every server the person
  is in; the store rewrites members, message authors and the self user.
- The picture is scrubbed of location data and cropped square at 512px **in
  the browser** (`ProfileSettings.tsx`, reusing `scrub-image.ts`). The server
  stores what it is given, 2 MB cap, image types only.
- Status is one line, 80 chars, shown under the name in the member list and in
  the panel at the bottom (in place of "Online" when set). Empty = null.
- Pins: `messages.pinned_at`, `PUT`/`DELETE /api/messages/:id/pin` (Manage
  Messages), `GET /api/channels/:id/pins` (read history). 50 per channel. A
  pin button on the hover bar, a "pinned" tag on the row, a pin button in the
  channel header opening `PinnedMessages.tsx` (jump-to flashes the row).
- Migration `0007`: additive.
- Tests: smoke test has 10 new checks (93 total). No browser test for these;
  `docs/shots/profile.png` and `pins.png` were taken by a throwaway script.
  **Not yet tried by a person:** the actual picture upload from a file
  picker, and the "pinned" tag on grouped rows.
- Found on the way, not fixed: a zod `.parse` failure in any route is a 500
  ("Something went wrong"), because `app.setErrorHandler` does not know
  ZodError. `profile.ts` uses `safeParse` + `badRequest` instead. Worth a
  general fix: map ZodError to 400 in the handler.

## Desktop app updates itself: signed client updates, 2026-09-21

Wes asked whether every change needs a reinstall. It did. Now it does not.

- **Deploy with `bash scripts/release.sh`**, not `ship.sh` directly. It signs
  the client built from the current commit, commits the two signed files,
  pushes, deploys, and checks the box serves the version just signed. The tree
  must be clean first. `ship.sh` alone still updates the website, but installed
  apps would stay on the old client.
- An update is `web/public/desktop-update/client.bin` (every built client file,
  gzipped JSON, about 500 KB) and `client.json` (version, sha256, size, Ed25519
  signature over version + hash). Vite copies `public/` into the build, so the
  box serves them at `/desktop-update/` with no nginx change. The client the
  desktop app runs is the one built **on the PC**, not the one built on the box.
- **The signing key is `~/.scryproof/update-key.pem` on Wes's PC**, made the
  first time `npm run release:client` ran. Never printed, never committed,
  never on the box. The public half is `desktop/src/update-key.pub.pem`, baked
  into the installer. Lose the private key and everyone reinstalls once from an
  installer built with a new one (delete the `.pub.pem`, run again). Wes
  saved a copy in Bitwarden as a secure note, 2026-09-21. Anyone
  who copies it can ship code to every installed app.
- The app (`desktop/src/main.js`, "updates"; `update-core.js` is the verifying
  part with no Electron in it): checks at start and every 10 minutes, verifies
  signature then hash, refuses anything not newer than what it runs (no
  replaying an old signed client), keeps the verified bundle in memory and
  serves from there, caches it in `userData/client-update/` and re-verifies it
  from scratch on every start. The page gets a banner, "A newer Scryproof is
  ready. Reload now", or "Reload when your call is over" in voice. Left alone,
  the update is simply in use next launch.
- `npm run dist` in `desktop/` signs a client too and writes
  `desktop/src/client-version.json`, so a fresh installer knows how new its own
  client is. Release right after building an installer so the two match.
- A reinstall is now needed only when the shell changes (`desktop/src/*`,
  Electron version). Shell auto-update is not built; it needs a code-signing
  decision first (money, Wes's call).
- Tests: `desktop/test/update.test.mjs` (8: forged key, changed bytes, changed
  version, moved signature, nonsense, climbing paths, wrong key type) and the
  end of `npm run test:desktop`, where a fake update server tampers, forges,
  serves the real thing, then replays an old one.
- Cost: about 500 KB added to git per release. If that ever matters, move the
  two files to an scp step.

## DM stage 3, the recovery phrase: built 2026-09-21

Twelve words that are a device. `web/src/lib/dm-recovery.ts` has the long
explanation; the short one:

- The words (BIP39, 128 bits) are turned into two P-256 keys, the same way
  every time. The public halves are published as a device whose id starts
  `recovery-`. Messages get locked to it like any other device. Typing the
  words into a new device rebuilds the private halves there. **The server
  holds public keys and locked copies, which is all it holds for any device.
  No words, nothing derived from them, no wrapped private key.** Rule 8 holds
  without an argument about what "backed up" means.
- **Vouching.** A device row can carry `endorsedBy`: a signature by another of
  the same person's devices. `assessDevices` trusts an unfamiliar device if one
  it already trusts vouches for it, and follows chains. The laptop that makes
  the phrase vouches for it, the phrase vouches back, and the phrase vouches
  for any device its words are typed into. So a friend's app trusts your new
  laptop without an Accept prompt, and your devices trust each other. A key
  that *changed* is never rescued by vouching. The server checks endorsement
  signatures to keep junk out; it cannot make one.
- **History from before the phrase.** `dm_message_keys.wrapped_by`: a copy of a
  message key made later by one of the reader's own devices (`rewrapKey`),
  opened against that device's key, and only if that device is trusted.
  `POST /api/dms/:dmId/keys` takes them, only for the person asking. Making a
  phrase sweeps every conversation; after that `passOn` runs on every fetch, so
  gaps (a friend whose app had not yet seen the phrase) close by themselves.
- The device that makes the phrase keeps nothing of it. A device the words are
  typed into keeps the DM private key as a non-extractable handle in IndexedDB
  (`dm-recovery` store, DB version 3), never the words or the signing key.
- Making a new phrase deletes the old recovery device on the server. One per
  person. Recovery devices are exempt from the 20-device pruning.
- UI: bottom of the DM sidebar (make / enter / make a new one), and a banner
  over any conversation with locked messages. The words are shown once and
  three of them are asked back before anything is published.
- New dependencies, web only, pinned: `@noble/curves` 2.4.0 (WebCrypto cannot
  derive a P-256 key from a seed) and `@scure/bip39` 2.4.0 (the word list and
  checksum). Same author as the `@noble/hashes` otplib already pulls in,
  audited, no network calls (grepped), past the 7-day cooldown.
- Migration `0006`: three nullable columns. Additive.
- Tests: `web/src/tests/dm-recovery.test.ts` (14, including forged and moved
  endorsements) and step 11 of `npm run test:dm`, which makes a phrase, opens a
  fourth browser as "Wes's new laptop", checks the history is locked, types the
  words, checks everything opens, that Alex was never asked to accept
  anything, and that no two of the words ever appeared in a request.
  Shots: `docs/shots/recovery-phrase.png`, `recovery-restored.png`.
- Honest limits, not yet fixed: whoever reads the words reads the DMs. A
  retired phrase still opens copies made while it was current, for someone who
  also has the account. A hostile server could leave the recovery device out
  of the list it hands a friend, and their messages would then not be
  recoverable (denial, not disclosure; `passOn` repairs it next time a real
  device of yours opens them).

## Private channels, mutes, the build stamp, and cheaper agents: 2026-09-21, later

Built after the recovery phrase and released together.

- **Private switch.** "Private channel" checkbox in the new-channel dialog
  and on a channel's Overview tab, with a roles list and a people list. It
  writes plain overwrites (deny View channel to @everyone, allow it to the
  chosen) and touches only that one bit, so the Permissions tab shows exactly
  what it did. Whoever flips it is always let in. `Channel.private` is read
  from the overwrites, never stored on its own. Server: `services/privacy.ts`
  (pure `planPrivacy`/`readPrivacy` with 8 unit tests), `GET`/`PUT
  /api/channels/:id/privacy` (Manage Channels), `private` in the create body.
  Client: `settings/PrivacyPicker.tsx`. 11 smoke checks. A private channel
  shows a small dot before its name in the list.
- **Mute a server or a channel.** Right-click a server icon or a channel for
  Mute/Unmute. Muted means no sound and no pop-up from there, even for a
  mention; the unread mark and mention badge still show. The notification
  timeline still lists it. Muted things are listed at the bottom of the
  notification settings with an Unmute button. Stored in localStorage with
  the other notify prefs, per browser.
- **Bad input is a 400.** `ZodError` in `app.setErrorHandler` now answers
  `invalid_request` with a plain sentence instead of a 500.
- **Forgotten uploads are swept.** `services/upload-sweep.ts`: attachments
  never attached to a message, older than 24 hours, are deleted (object then
  row), a minute after start and hourly. DM files (`dmFiles`) have the same
  shape and are NOT swept yet.
- **Build stamp.** The foot of the user menu (bottom-left, click your name)
  says `build <commit>, <time>` and, in the desktop app, `app <shell version>`.
  Wes asked for it so what he sees can be compared with what shipped. The
  update banner is the accent colour now: the first one was a thin grey strip
  and he did not spot it.
- **Video quality** (Wes, 2026-09-21: "let people stream their vids/cams at
  high quality"). Screen share already went to native size at 60 fps. Added:
  a camera quality choice in voice settings (720p or 1080p, 30 or 60; default
  720p30; up to 5.3 Mbit/s), VP9 for all video with VP8 as the fallback
  (voice-check proves VP9 is on the wire through the encryption), and a
  readout on the focused video ("1920x1080, 60 fps, VP9") measured off the
  <video> element itself so what a viewer actually gets can be read, not
  guessed. Remember adaptiveStream: a small tile gets a small layer on
  purpose; the full picture arrives when it is focused or full screen. The
  box forwards each stream to every viewer, so a 12 Mbit/s share to five
  people is 60 Mbit/s out of the droplet; fine for a game night, worth
  watching on the bandwidth graph if it becomes nightly. Under your own
  focused camera there is a grey line from `cameraReport()`: what was asked
  for, what the camera is giving, the most it says it can do, and a note
  that slower-than-it-could-be usually means a dark room. Wes's camera gave
  1080p at 15 with 60 selected; that line is the answer to "is my camera
  shit or is the app capping it" (the app never caps; the camera does).
- **Updates never act on their own** (Wes, 2026-09-21: "I don't want to auto
  open/close anything on anyones setups"). A reload-when-idle was built and
  reverted the same hour. The rule: the app checks every 5 minutes (shell
  0.3.0; 10 before) and shows the bar; a browser tab does the same by fetching `/` every 10 minutes and
  comparing the `assets/index-*.js` name (`watchSite` in `web/src/lib/desktop.ts`);
  the reload is always the person's click. Left alone, the new client is
  simply there next launch or next page load.
- **Two layers, one rule for installers.** Everything in `web/` reaches every
  app through the bar with no installer. Everything in `desktop/` (shell,
  tray, the update checker and its 5-minute constant, any native hook) is
  baked into the `.exe` and does not update itself, so shell changes ship as
  one installer that Wes hands out, not several.
- **Global push-to-talk and the installer link** (2026-09-22, shell 0.2.0).
  `desktop/src/push-to-talk.js` watches one key system-wide through
  uiohook-napi 1.5.5, vetted by reading it: no network code, the shipped
  `.node` imports only kernel32/user32/advapi32, and the installed binary's
  hash matched the one read. It runs only while the page asks (voice channel,
  push mode), reports held/released for that one key and nothing else, and
  does not take the key from the game. Browser and older shells fall back to
  the window's own key events (`holdPushKey` in `web/src/lib/desktop.ts`).
  `npm run test:desktop` proves the hook starts inside real Electron.
  electron-builder has `npmRebuild: false`: the prebuilt N-API binary is the
  point, and there is no Visual Studio here. The installer is served at
  **https://scryproof.com/download/Scryproof-Setup.exe** by the app from
  `<DATA_DIR>/downloads/` on the vault (`server/src/routes/downloads.ts`,
  `scripts/publish-installer.sh`), because GitHub refuses files over 100 MB.
  Two traps met on the way: after an `infra/` change, `bonesdeploy site
  runtime --yes` renders the nginx file but does not restart
  `scryproof-nginx.service`, so `systemctl restart scryproof-nginx.service`
  on the box is needed too; and `release.sh` curls health the instant the
  service restarts and can see a 502 that clears in seconds. Not yet tried by
  a person: holding the key with a game in front. Mouse buttons as the
  push-to-talk key are not supported yet.
- **Start with Windows, and the 5-minute check** (2026-09-22, shell 0.3.0).
  A checkbox in the tray menu, "Start with Windows (in the tray)", off until
  the person ticks it. Ticking it writes one Run entry for that Windows
  account (`app.setLoginItemSettings`, HKCU, nothing machine-wide) with
  `--hidden`, so at sign-in the app loads the page (gateway connects,
  pop-ups arrive) but stays in the tray until clicked: nothing appears in
  anyone's face. Unticking removes the entry. The menu re-reads what
  Windows has after each click rather than trusting the click. A development
  run (electron.exe) has the item greyed out. Same installer carries the
  update check moved from 10 to 5 minutes. Not yet tried by a person: the
  toggle itself, and a sign-in with it on.
- **Second agent batch: search, custom emoji, spoilers, DM file sweep**
  (2026-09-22). Briefs in `docs/briefs/`, one agent each in a worktree, the
  main session reviewed, merged and resolved the conflicts (spoilers and
  emoji both changed `splitContent` and the message renderer; groups are now
  mention 1, emoji 2, spoiler 3). What landed:
  - Search: magnifier in the channel header or Ctrl+F, Enter to search,
    results replace the member list, click jumps to the message. Server
    route `GET /api/servers/:id/search` only queries channels the caller
    has VIEW_CHANNEL and READ_MESSAGE_HISTORY in (`services/search.ts`,
    test in `search.test.ts`). DMs are not searched: the server cannot read
    them. Known limit, shared with pins: a hit older than the loaded 50
    messages scrolls to nothing. Fix is "load messages around an id";
    do it once for both.
  - Custom emoji: server settings, Emoji pane (MANAGE_SERVER), PNG/GIF/WebP
    up to 256 KB, 50 per server, scrubbed in the browser like avatars.
    `:name:` draws inline, `:` plus two letters autocompletes in the
    composer, "This server" row in the reaction picker, reactions stored as
    `:name:`. Image route is member-only. Migration 0008 runs at boot.
    Quirk: `:30:` in "12:30:45" parses as an emoji part and draws back as
    text, harmless.
  - Spoilers: `||text||`, blacked out until clicked, plain inert text while
    hidden so a link inside cannot be clicked early; `[spoiler]` in reply
    and notice previews.
  - DM file sweep: unclaimed `dmFiles` go with the hourly attachment sweep.
  Not yet tried by a person: any of it in the real UI. Unit, smoke, DM and
  desktop checks pass; search and emoji routes were exercised by hand
  against the dev server.
- **Third agent batch: jump to any message, timeout, block, /roll**
  (2026-09-22, same evening). Briefs in `docs/briefs/`; merged one at a
  time. Two of the three migrations collided on number 0009, so the later
  ones were dropped and regenerated on the merged schema (0009 timeout,
  0010 roll's `messages.kind`, 0011 blocks); do the same next time rather
  than hand-editing the journal. What landed:
  - Jump: `GET .../messages?around=<id>` (25 either side); the store holds
    a "window" for that channel, pages down as well as up, drops gateway
    messages while windowed, and forgets the window when you leave the
    channel. Pins and search hits land however old. DMs still give up on
    an unloaded message.
  - Timeout: `MODERATE_MEMBERS` (bit 26), `members.timeoutUntil`,
    `PUT/DELETE .../members/:id/timeout`, `assertNotTimedOut` on send,
    edit, react and voice token. The member list row has a menu (the `⋯`
    on hover, or right-click): Message, Block/Unblock, and for moderators
    Time out (1 min to 1 week) / End timeout. Typing indicator and voice
    occupancy are not gated; a file can be uploaded but not posted.
  - Block: `blocks` table, `GET/PUT/DELETE /api/blocks`, list rides in the
    `ready` frame. Server drops pings and badges from a blocked author and
    refuses DM open/send both ways with different wording. Client collapses
    their messages ("Blocked message. Show."), filters their reactions,
    silences notices, swaps the DM composer for Unblock, and has a
    "Blocked people" dialog off the user menu. No gateway event: a second
    window learns on reconnect.
  - /roll: `shared/src/dice.ts` (NdS, modifiers, kh/kl, adv/dis, 100 dice,
    2 to 1000 sides), `crypto.randomInt` on the server, stored as
    `kind: 'roll'` with plain text `2d6+3 = 11  [4, 4] +3`; rolls cannot
    be edited. Drawn as expression, big total, small faces.
  Verified by hand against the dev server (a timed-out member gets the 403,
  a bad roll the 400, block round-trips). Not yet tried by a person in
  the UI.
- **How the work was split.** Three of these (Zod, sweep, mute) were built by
  cheaper agents in git worktrees from a written brief, each ran the unit
  tests and committed on its own branch; the main session reviewed and merged.
  Lesson: never `git add -A` while `.claude/worktrees/` exists (it is
  gitignored now). The briefs that worked said: read CLAUDE.md, one job,
  which files, which tests, do not push, report exact test output.

## Where to pick up (written 2026-09-21, later still, for a fresh context)

Everything above this line is live on scryproof.com and reaches the
installed desktop app by itself within five minutes (ten on shell 0.2.0;
accent-coloured banner, "Reload now").

Not yet tried by a person: the private switch in a real dialog, the
right-click mute menus, avatar upload from a real file picker, real pop-ups
on Windows, 1440p60 share, the camera report line, the browser update bar
appearing in a tab left open. The build stamp works (Wes read it).

The stamp shows the commit the client was built from, which is the one
*before* the "Signed desktop client N" commit release.sh makes.

Do next, in this order:

1. ~~Global push-to-talk~~ shipped in shell 0.2.0; ~~start with Windows and
   the 5-minute check~~ shipped in shell 0.3.0 (both above). The link always
   hands out the newest: https://scryproof.com/download/Scryproof-Setup.exe.
   ~~Search, custom emoji, spoilers, DM sweep~~ and ~~jump, timeout,
   block, /roll~~ merged and deployed 2026-09-22 (two agent batches,
   above). Wes has not clicked through any of them yet: that is the next
   thing to do with him, screenshots in hand.
2. **Electron fuses**, and a plan for updating the shell itself (needs a code
   signing decision, which costs money, so it is Wes's call).
3. **UI pass.** Wes asked for it 2026-09-22. Read `docs/visual-plan.md`
   (three directions, built and screenshotted, he picks) and the-wall.md
   first. His screenshots, if any, are in `Pictures\Screenshots`.
4. Next agent batch (write briefs in `docs/briefs/` first): bookmarks;
   polls; voice messages. Main session: voice changers (Wes, nice to
   have; a node in the `voice-audio.ts` graph before encryption), group
   DMs, safety number, soundboard, phone layout. R2 stays flagged.

Deploy with `bash scripts/release.sh` (clean tree required). Local loop:
`bash scripts/dev-restart.sh` then `npm run test:smoke` on the clean
database; then `npm run seed` and `test:dm` / `test:desktop`. The seed
refuses a database that already has accounts, and the smoke test needs one
with none, so the order is restart, smoke, restart, seed, the rest.

## Next, in order

Rewritten 2026-09-21, after the desktop shell. The droplet, domain and M0 are
done; the old list here was about getting onto the box.

1. ~~Notifications, with a timeline.~~ Built and live, and muting one server
   or channel followed on 2026-09-21. Original note: Desktop pop-ups for mentions and DMs
   ("who, not what" for DMs), plus Wes's idea: an inbox that lists what you
   got, when, and from which server and channel, so a busy day can be traced.
   Built once for browser and desktop app.
2. **Desktop basics:** tray icon, start with Windows, global push-to-talk.
3. **Stream quality picker.** The streamer picks resolution and frame rate. No
   cap from us (Wes, 2026-09-21); add one only if bandwidth becomes a problem.
4. ~~DM stage 3: recovery phrase.~~ Built 2026-09-21, see above.
5. ~~The quick four~~ Built 2026-09-21, see above.
6. **Private channels in one click.** Hidden text and voice channels already
   work through permission overwrites (deny View Channel to @everyone, allow a
   role), and the server enforces it. What is missing is the Discord-style
   "Private channel" switch when creating one, with a picker for who gets in.
   Wes asked for this 2026-09-21.
7. **UI pass** (waiting on Wes's screenshots; read the-wall.md first).
8. Electron fuses, and updating the shell itself (client updates are done, see above). Then search, custom
   emoji, soundboard, phone, group DMs, safety number.
9. **Trey's E2EE hardening, PR #1 (`review/crypto-red-tests`).** Reviewed
   2026-09-25: merged to main with the review fixes on top (Wes: "you fix and
   then we can push all at once"; commit efa1697, Trey's commits intact).
   Fixed: (a) this device is never taken from the server's list, and a
   listing under its id with another key is unreadable, so "made by me" no
   longer skips acceptance; (b) live plaintext, or plaintext after a sealed
   message, is forged in a channel seen encrypted; (c) a device that has let
   nobody else in waits (`KeyWait('nobody-else')`) instead of making a key
   only it can open. Attack tests for all three in
   `review-channel-keys.test.ts`, red on the PR as it was. Smaller ones fixed
   too: DM "written" date, replay comments, `isApiUrl` backslash (was real:
   Chromium reads `\` as `/` on `app:`), `*.pem eol=lf`, voice "Let in" no
   longer waits on IndexedDB (the DM approval in `dms.tsx` still does; harmless).
   Tests 252/353/48. Still open: Wes's call on approving in a call = every
   channel (lean: keep, say so on the button); build and test the 0.5.3
   installer ourselves before members get it; everyone updates the same night,
   because mixed versions show mismatched call codes. Tell Trey his PR went
   in with changes on top (Wes sends it).
10. **Mac and Linux desktop builds.** Wes, 2026-09-25: it should work on all
   three; members use Mac and Linux. Research and plan later, after PR #1
   lands. Known work: electron-builder targets (AppImage, dmg), the updater
   only knows the Windows installer, uiohook push-to-talk fails on Wayland and
   needs the Mac accessibility prompt, system-audio screen share on Mac is
   unknown, and Apple notarization costs a yearly developer fee (Wes's call).
   Linux first; Trey can test it.

**Later, and flagged: Cloudflare R2 for file storage** (suggested by Wes's
friend, 2026-09-21). As asked it breaks non-negotiable 1: channel attachments
are not end-to-end encrypted, so R2 would hold members' files readable by
Cloudflare. Ways it could be made to fit: only ever store bytes that were
locked in the browser first (DM files already are; channel files would need
the same treatment, which means per-channel keys, which is M7 territory), or
use it only for encrypted restic backups, which is already allowed. Disk is
not a problem yet: the volume is 10 GB and can be grown. Talk it through with
Wes before building anything.

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

## Visual pass, 2026-09-22 (written at the session limit; picks up at 4:10am ET or later)

Live on scryproof.com: the voice-join fix (client 1790047346369). A join
that fails before the server lists you now shows its reason and the
button reads "Joining…". Wes's test user on Firefox saw the E2EE refusal
text as a result (Downloads/image.png); shorten that text and put the
installer link under it (`web/src/lib/voice-key-provider.ts`), once the
stylesheet is quiet.

**Not deployed, on `main` locally (pushed):** direction B, the candle-lit
hall, is the visual base (Wes: "I like B the most right now. Not crazy
about that specific background image but it could always be saved as a
'theme' someone could choose."), plus C's composer label ("I do like the
function at the bottom of C where it kinda reminds you what channel you
are chatting in"). Three directions were built blind of each other by
agents from `docs/briefs/visual.md`; branches `visual-a` (finished room +
four themes, Paper is the good one), `visual-c` (no rail, members drawer,
call strip) still exist for parts. Side-by-side: `docs/shots/visual-directions.png`.

**Wave two (`docs/briefs/visual-2.md`) is finished on `main` (commit
`6eac9ea`, 2026-09-22 morning), not deployed.** Four themes, chosen from
the user menu at the bottom of the sidebar (Themes): the hall (default,
direction B), the chamber (`scry`: a dark stone room lit from a basin of
water), the ridge (a campfire under a cold sky) and plain (the warm room
with no painting). The choice lives in this browser only, key
`scryproof.theme.v1`. Adding a theme is one file in `web/src/themes/`, an
`@import` at the top of `styles.css`, and an entry in `lib/themes.ts`;
`npm test` checks every theme sets every token the hall sets.

![The Themes dialog](shots/theme-picker.png)

![The chamber](shots/theme-scry.png)

![The ridge](shots/theme-ridge.png)

Each theme card in the dialog is painted by reading its own token block out
of the loaded stylesheets and setting them inline (`ThemePicker.tsx`), so
the card looks like the room before you click it. The screenshot script has
`--theme <id>`. Branches `visual-themes`, `visual-scry`, `visual-ridge` and
their worktrees can be deleted; `visual-a` (Paper theme) and `visual-c`
(no rail, members drawer, call strip) still hold parts worth lifting.

**Wes chose, 2026-09-22 morning, and it is live on scryproof.com
(client 1790082465860):** the chamber is the default, and there are no
gaps between the panels ("I like gaps none more"). He saw a 4px-seam
version and a flat version side by side and took flat: one surface,
hairlines where panels meet, no shadow, no rounded corners. `--gutter`
and `--radius-panel` stay tokens at zero. Of the paintings themselves:
"I'm not crazy about the actual background images but thats fine for
now". The generated SVG backdrops are a placeholder in his eyes; a better
painting is a later job, not a rebuild.

![The chamber, no gaps, as shipped](shots/app.png)

**Later the same morning, live (client 1790083800713): real paintings.**
Wes: "Can you just find some cool free images instead? Or log in to Gemini
and make some?" Three made through the `imagegen` skill (Gemini web, no
API, nothing in the data path; the JPGs are served from our box like any
other static file): the chamber (two variants, he picked B, a wizard's
room with a basin and a window), the hall (hearth and long tables), the
ridge (campfire under the milky way). Originals in `assets/gen/`, served
copies in `web/public/backdrops/`. The SVG generators are deleted. Panel
alpha on the three painted themes is 0.6 ("b open", chosen over 0.72 by
screenshot); at 0.82 the picture was a smudge and A and B were
indistinguishable in the app. Plain is unchanged.

![The chamber](shots/theme-scry.png)

![The hall](shots/theme-hall.png)

![The ridge](shots/theme-ridge.png)

**Firefox refusal, live (client 1790084289597):** two sentences and a
link to the installer under them (`voice-key-provider.ts` returns
`installer: true`, the snapshot carries it, `VoicePanel.tsx` draws the
link). Photographed from Chrome with the new `--user-agent` flag on
`shot.mjs`; channel buttons now carry their type as a class
(`button.channel.voice`) so the script can pick the voice channel.

![What Firefox is told](shots/voice-firefox.png)

**Notification volume, live (client 1790085165824):** Wes: "They are a
little quite right now." Notifications settings has a Volume row, 0 to
200%, in `notifyPrefs.volume`; both designed levels went up by half
(`notifySounds` in `notify.ts`). Not touched: the call join and leave
chimes in `voice-audio.ts`, which have no slider.

**Desktop pop-ups, as Wes asked how they work:** off by default; the
toggle in Notifications settings asks the browser for permission (must
come from a click). Browser: the site's permission plus Windows allowing
that browser to notify. Desktop app: `main.js` grants `notifications` to
our origin and sets the AppUserModelId, so the toggle just works, but no
person has yet seen a pop-up from the desktop app.

**The ridge is the default theme, live (client 1790096728918).** Wes,
mid-morning: "Make the ridge the default theme for people." `ridge.css`
matches bare `:root`, `scry.css` only its own attribute, THEMES leads
with the ridge. A saved choice in localStorage still wins.

**Formatting pass, live in the same client.** Wes: "Some of the text is
getting cut off. Some of the buttons aren't centered. I think in General
the text can be larger... more bold or more white on text so it's clearer
on background." His five screenshots showed the composer label clipping
"# ideas-suggestion", the server name ellipsized in the sidebar header,
and the hover tray's glyphs off centre. Shipped, all in `styles.css` and
the four theme files:

- Message text 16px in full `--text` (was 15px at 80% of it); author
  15px; timestamps 12.5px; "edited" 12px in muted. Body face 15px. Every
  readable size under 12px became 12px, 12.5 became 13, 13.5 became 14
  (glyph and avatar sizes left alone).
- Every theme's `--text`, `--text-muted`, `--text-dim`, `--text-faint`
  one step brighter. Not measured against the paintings; judged by eye
  on the four theme shots. If a theme's dim text still reads badly over
  its brightest patch, lift that theme's `--text-dim` alone.
- Composer label up to 32 characters before ellipsis; attach and send
  buttons 46px tall so they sit on the input's first line.
- Hover tray buttons 28px square, glyph on one line box (`line-height:
  1` on every `.icon-button`).
- Server name in `.sidebar-header-name` wraps to two lines, then clips;
  the three header buttons are 26px wide in `.sidebar-header-tools`.
- `.modal-body` has 16px under its last row.
- `.user-panel` wraps: identity first, the buttons in `.user-panel-tools`
  drop to a second row on the right when the five call buttons are up.

Before is in his screenshots (Pictures\Screenshots, 2026-09-22 11:33 to
11:35); after is every shot in `docs/shots/` retaken this morning:

![The ridge, default, after the pass](shots/app.png)

Wes has not yet looked at the live result.

**Next:** Wes's pick from the backlog, offered in this order: phone
layout, group DMs, Electron fuses, soundboard, safety number.

**From the friends' chat, 2026-09-22 (milky = Wes, lamp = a friend):**
1. Viewer chooses the video and screen quality they receive (LiveKit
   simulcast layer selection; receive side only, no effect on E2EE).
2. A green speaking ring on the name in the channel list and member
   list, not only in the voice view.
3. Camera and screen icons beside whoever is sharing.
4. "Google Drive for the exe": already covered by the one download link
   and the client self-update. Told Wes. The Electron shell itself still
   changes only by reinstalling from that link.

**Items 1 to 3 built and live the same afternoon, two clients.**

*Client 1790103773366, who is talking and who is sharing.* The speaking
ring reaches the channel list (`.voice-member.speaking`) and the member
list (`.member.speaking`); the member list marks who is in voice
(`.member.in-voice`, a sound glyph, tooltip names the channel); camera and
screen get drawn marks from `components/glyphs.tsx` in both lists. All
three read the call through `state/useVoice.ts`.

Found on the way: **the ring itself was broken.** LiveKit's
ActiveSpeakersChanged never fired in `test:voice`, so the voice tile
never ringed either. Cause not proven (the server has only packet
headers to go by with E2EE, and the fake microphone may sit under its
threshold). Fix that does not depend on it: `OutputMix` in
`voice-audio.ts` marks a person talking when a 20 ms slice of their
decrypted sound is over -45 dBFS, held 300 ms; `voice-session.ts` merges
that with whatever the server says. Screen-share sound never rings.

*Client 1790104273801, video you receive.* Voice settings, bottom:
"Video you receive", Sharp / Medium / Low (`receiveQuality` in
`voice-prefs.ts`). `capPicture()` in `voice-session.ts` calls LiveKit's
`setVideoQuality` on every incoming camera and screen, at subscribe and
whenever the pref changes; adaptive stream still fits the tile underneath
the cap. The connection panel shows "Video 1920x1080", the largest
picture arriving (`stats.receiving`).

The catch, and the trade made: **a screen share is now VP8 in two sizes,
not VP9 in one.** Chrome cannot encode a VP9 screen share with more than
one spatial layer (LiveKit forces L1T3), and LiveKit only takes VP9 as
rid-based simulcast on a server *newer* than 1.13.6, which is exactly
what the box and `.tools/livekit` run. So on VP9, Low had nothing smaller
to pick (the test proved it: 960 wide stayed 960). On VP8 with two
layers, Low takes 1920 to 960. Cameras stay VP9 SVC, whose spatial layers
the cap can pick. To get VP9 screen share back: upgrade LiveKit on the
box past 1.13.6 (`infra/box/remote/60-livekit-install.sh`, one version
string) and the local binary, then drop `videoCodec: 'vp8'` in
`setScreenShare`. Not urgent; nobody has said the share looks worse.

`test:voice` is 35 checks now (was 28 this morning): the ring and the
marks in both lists, the screen mark, Low shrinking the decoded width,
the panel naming the size, Sharp growing it back.

![Both lists during a call: in-voice marks, Alex ringed on the stage](shots/voice-lists.png)

**Wes has not yet seen either on the live site.** The plan he approved
had a third step: nothing, until he and lamp try a real call with a
share and one of them on Low.

**Evening: the picker fixed, and a theme that moves (client 1790105431614).**
Wes: every card's preview said "# the-hall" (now the theme's own name),
and the one-line moods are gone ("they don't need to read anything
really about the theme"). Then: "try something a little more fancy on a
new one. Maybe its like a video... fire flies / stars shining / embers /
maybe a river. Super subtle."

Not a video: a video file behind 60% panels would be megabytes for a
smudge, and it would cost battery on every laptop. Instead
`components/Ambient.tsx` owns the `.ambient` painting and a canvas over
it, and a theme asks for motion with `--ambient-motion` (every theme
declares it; the hall contract test enforces that). Words so far:
`embers` (sparks rising from `--glow-position` in `--glow-color`, dying
over 5 to 11 s) and `stars` (points in the top of the sky, each on its
own slow breath). Thirty frames a second, stops when the tab is hidden,
never starts under "reduce motion". The new theme `ember` ("The ridge,
alive") is the ridge's tokens plus `--ambient-motion: embers stars`.
The ridge stays the default and stays still.

Not built yet, and cheap if he wants them: `fireflies` (slow, greenish,
low in the trees), `smoke` (a soft column above the glow), `river`
(a shimmer band; needs a painting with water, none of the three have
one). A river would want the chamber's basin, not the ridge.

![The ridge, alive: embers over the fire, stars overhead](shots/theme-ember.png)

**House rule, live (client 1790105624485).** Wes: "auto-censor the words
bigballer, big baller, bigballa, bigballah. Or like replace it with 'I'm
an idiot'. It's an inside joke." `shared/src/house-rules.ts`, one regex
and the line to say; applied by the sender's client in `Composer.tsx`
(send), `MessageList.tsx` (edit), and `state/dms.tsx` (DM send and
edit), so it holds inside E2EE DMs and the server reads nothing. A
client older than this one would not apply it; they all update within
ten minutes. To add a rule, add a row to `HOUSE_RULES` and a line to
`web/src/tests/house-rules.test.ts`.

The seeded local database still has ~20 "new device" notices for wes from
headless shots; `shot.mjs` should reuse a device profile.

## Evening batch from lamp's notes, 2026-09-22 (client 1790108061747)

Lamp and Wes sent a second list. Built in this order, one commit each,
released together:

**Profile card.** "Make usernames / profile pictures clickable" and "do not
automatically open DMs... an overlay that allows you to choose message,
add friend, see profile" (lamp, with a Discord screenshot). Every name and
picture (member list, message authors, DM authors and header, voice rows
under a channel, your own picture bottom left) opens
`components/ProfileCard.tsx` beside the click: banner in their accent,
big picture with presence, name, `@handle`, nickname vs. display name,
status line, role chips, "In <channel>" with the sharing marks, "Here
since <month>", Message / Block (Edit profile on your own), and a line to
send a first message without leaving the card (`openWith` now answers
the dm id so the card can `send` to it). One provider in `App.tsx`; one
card at a time; placed by `lib/place.ts` (tested), a bottom sheet under
640px. There is no "add friend": DMs are open between people who share a
server, so there is nothing to add. The member row's right-click and the
"..." menu still hold time out and the rest.

![Alex's card from the member list](shots/profile-card.png)

**Picture viewer.** "Make images clickable so you can zoom in, copy,
save/download" (Wes). `components/Lightbox.tsx`: full screen, scroll to
zoom around the pointer (`lib/zoom.ts`, tested), drag, click to flip
between fitted and actual size, Copy (PNG to the clipboard, redrawn
through a canvas when the source is not PNG), Save (download under its
own name), Escape. Works the same on a DM picture, from the blob this
browser decrypted. `shot.mjs` gained `--eval "<js>"` and, in dev,
`window.__openPicture()` for the screenshot.

**Text styles.** "Very basic wysiwyg text markup options" (lamp).
`**bold**`, `*italic*`, `~~struck~~`, `` `code` `` are new part kinds in
`splitContent()` (`shared/src/validation.ts`), nested the same way as
spoilers, with the rule that italic must touch its text so `5 * 3 * 2`
is arithmetic. Still no markup parsing anywhere: parts become elements.
DMs now draw the same parts through the exported `Rich` in
`MessageList.tsx` (their own link-only pass is gone). Four buttons under
each composer (`components/MarkupTools.tsx`) and Ctrl+B / I / Shift+X / E
wrap the selection (`lib/markup.ts`, tested; applying twice takes the
mark off). Editing gives the markers back through `toDraft`.

![Styles drawn, and the buttons under the box](shots/markup.png)

**Phone drawers and install.** "Mobile friendly. PWA as the app. Can the
PWA have knowledge of when an update is available" (lamp). Under 640px
the servers and channels are a drawer from the left (the lines button in
every header, `components/DockButton.tsx`, asks the shell through the
`OPEN_DOCK` signal) and the members a drawer from the right (the member
count). Picking anything closes them. On a wide screen the `.dock`
wrappers are `display: contents`, so nothing there moved. Installable:
`web/public/manifest.json`, icons made from the desktop icon
(`web/public/icons`, PIL, one-off), and `web/public/sw.js`, a service
worker that caches nothing (the page is no-store and the app already
watches for a new build; a cache would fight both). "Install on this
device" appears in the menu behind your name only when the browser
offers it and never inside the desktop shell. Updates in the installed
app: the same `watchSite` check every ten minutes and the same
reload-when-you-choose banner, since it is the same page. **Untested on
a real phone**; the shots are a 390x844 headless window.

![Phone: the channel drawer](shots/phone-channels.png)

**Not built, written up instead:** group DMs and calls inside DMs, both
from lamp. `docs/briefs/group-dms.md` and `docs/briefs/dm-calls.md` say
what already fits and what assumes a pair or a server. Both are
main-session jobs (E2EE path, voice grants).

**Stars.** Wes: "for the alive theme, throw some stars shining in there
too." They were there and too faint. Brighter, 110 of them, and each one
flares for under a second every minute or two.

Tests: server 168, web 159. Nothing in this batch needed a migration.

**To-dos from Wes, 2026-09-22 evening (not started):**

- **Channel deletion.** Wes asked to "allow for channel deletion". It exists
  (channel gear, bottom of the settings, "Delete #name") but is gated on
  MANAGE_CHANNELS, and he hit this on lamp's server where he is not owner.
  Either he could not find it or he had no permission; ask which before
  changing anything. If it is discoverability, a Delete item in the
  channel's right-click menu next to the gear is the fix.
- **"Someone" for a member who was there.** FIXED in the night push, see
  the next section; the notes below are what was known before. Screenshots in
  `Pictures\Screenshots` at 16:13: Wes had just joined lamp's server
  ("Superest Secretest Seahorse"). The header said 2 members, the member
  list showed only milky, the voice row under #important said "Someone" and
  the typing line said "Someone is typing", while lamp's messages drew with
  his name and picture (message authors come with the message; the sidebar
  and typing line look people up in `state.members`). A minute later lamp
  appeared and the names filled in. So `state.members[serverId]` was
  missing the other member right after joining, and something later
  refreshed it. Suspects: `loadMembers` running before the join finished
  or against a stale list; the `member_join` fan-out not reaching a
  socket that subscribed to the server mid-session. Reproduce with
  `test:smoke`-style two-user join before guessing.

## The night push, 2026-09-22 (client 1790111550396)

Wes: "add like a thing somewhere that shows updates that have been pushed.
It doesn't notify them but they can see what has changed when they are
logged in. Also, I want you to make a theme for a user. I have two images
in my downloads for reference. Go nuts with the 'effects' / alive feel on
that one. Do those and whatever else you want to work on."

**What's new.** `web/src/changelog.ts` is the list, newest first, written
for a friend and not a developer (no file names, say what was wrong when
something is fixed). "What's new" in the menu under your name opens it
(`components/WhatsNew.tsx`, notes drawn through `Rich` so **bold** and
`code` work in them). A dot on your name and on the menu item means there
is an entry you have not read; opening the list clears it. Read state is
on this device (`lib/whats-new.ts`, tested), a first visit is not news,
nothing pops up and nothing makes a sound. **The release script now
refuses to ship when the top entry is not from today** (`SKIP_NOTES=1`
to override), so every release comes with a note or a deliberate
decision not to write one. `shot.mjs` takes `--store key=value`.

![The list, in the dusk](shots/whats-new.png)

**The dusk.** His two reference pictures were pink clouds under a teal
night sky with a crescent moon, and a pink dusk gradient under a starry
black. Two paintings through imagegen; `dusk-a` (clouds, moon, dark
bottom third) is the one; `dusk-b` came back with a paper border and is
kept in `assets/gen/` for the record. `web/src/themes/dusk.css`: indigo
surfaces, the clouds' pink as the accent, moonlight where the others
have gold, lavender dim text at 7.9:1. Effects, all in `Ambient.tsx`:
stars down to 60% of the window in warm white (`--star-color`,
`--star-depth`, new tokens the hall names and every theme sets), a
**shooting star** every twenty to fifty seconds, **haze** (five faint
patches of the glow colour drifting sideways, screened so they light the
clouds), and **glimmer** (twenty-two four-point sparkles in the accent,
a second or two each, mostly where the clouds are). Same rules as the
ridge: thirty frames a second, stops when the tab is hidden, never under
reduce motion. Whether it is too much is Wes's call; the knobs are the
constants at the top of `Ambient.tsx` and the word list in `dusk.css`.

![The dusk](shots/dusk.png)

**"Someone" after a join, fixed.** The cause was in the client, not the
gateway: `member_join` for a server whose roster this browser had not
loaded started the roster with only the joiner, and the loader in
`App.tsx` (`if (state.members[server.id]) return`) took that for a
complete list. So the person who just joined saw only themselves until
something else refreshed the roster. The reducer now ignores a join for
an unloaded roster; the roster is fetched whole when the server is
opened. No test: the reducer is not exported. Worth one if it ever
regresses.

**Not done:** channel deletion is unchanged (still gated on
MANAGE_CHANNELS, still the question of whether Wes lacked the permission
on lamp's server or could not find the button). Group DMs and DM calls
are still briefs.

Tests: server 168, web 161. No migration.

## Loaf and Forg, 2026-09-22 (client 1790113070879)

Wes: "This one is going to be extra wild. A theme called Loaf. Just have
100 versions of his face plastered everywhere in the background. Like a 5
year old would do. ... Then make another one called Forg. ... Frog vibe.
Go nuts with the 'Alive' effects too. And lets push it to a staging site
/ local host for me to view before pushing it live live."

**Staging first, then live.** The staging site was the Vite dev server on
this PC at `localhost:5173` against the local seed data (sign in as `wes`,
the seed passphrase in `shot.mjs`). He looked, said "Ship it", and it was
released. That is the order of operations for anything he wants to see
before his friends do: dev server, his look, `release.sh`.

**Loaf.** `scripts/loaf-collage.py` (PIL only) cuts twelve faces from
`Desktop\loaf` by hand-picked boxes, gives each a wobbly scissors edge
and a paper border, glues a hundred of them down at random sizes and
angles over dark paper with crayon scribbles, dims the lot, and writes
`web/public/backdrops/loaf.jpg` plus `loaf-faces.png`, a sprite sheet of
the twelve. **His pictures never left this PC**: no face detector, no
imagegen. The theme (`themes/loaf.css`) has panels at alpha 0.72, a step
more opaque than the painted themes, and asks for `faces glimmer`. The
`faces` word (Ambient.tsx) reads `--ambient-sprite`, a new token the hall
names and every theme sets (`none` elsewhere), and floats nine cutouts
around the room, spinning, bouncing off the edges. Told Wes the collage
is a public picture at a guessable path like every backdrop; he shipped.

![Loaf](shots/loaf.png)

**Forg.** One imagegen painting (`assets/gen/forg-a.jpg`, first try) of
a pond at dusk with a frog on a lily pad. `themes/forg.css`: dark water
surfaces, frog green accent, lily pink where gold is. Two more words in
Ambient: `fireflies` (26 wandering lights in the accent, each blinking on
its own period, kept to the lower three quarters) and `ripples` (a pair
of flattened rings every one to four seconds, low on the water). Plus
`haze` over the sunset and `stars` in the top 16%.

![Forg](shots/forg.png)

Eight themes now. The picker scrolls. Tests: web 161, server 168.

**To-do for the next round (Wes, 2026-09-22, closing out):** rename the
dusk theme to **"Ham"**. Done in the next section; the id stayed `dusk`.

## Commands and the characters, 2026-09-22 (live, client 1790117998502)

Wes: "I like the idea of commands. One that i think would be cool is to
use some of the characters from the meepo game. Maybe you can like do a
/Tang-jump and the characters jumps across the screen." Then: "or it can
kinda work like a soundboard where you open a panel and can click which
one you want to spawn." Plus lamp's list from the afternoon screenshots
(the `+` after reactions, emoji in the box with `:+1:`, styles when
editing) and the Ham rename.

**Characters.** All 27 from `CodeProjects/meepo-auto-battler` (his own
game). `scripts/meepo-sheets.py` (PIL) glues each one's five processed
jump frames into `web/public/meepo/<id>.png`, 640x128, transparent; 2.7 MB
in all, fetched only when one is drawn. `lib/commands.ts` is the list.
Rerun the script and paste its output there when a character is added
over there.

**How a jump travels.** `/tang-jump` is sent as its own text, a plain
message, kind `text`. The server does not know it is a command, there is
no migration, and it works inside an encrypted DM the same way. Every
client that sees the message *arrive* (`message_create` for the channel
being looked at; the DM store after decrypting, if that DM is open) asks
`lib/stage.ts` to play it, and `components/Stage.tsx` draws the character
hopping across a fixed layer over everything, five frames per hop on a
small arc, two or three seconds, then gone. The sender's own message
comes back through the gateway, so they see it too. In the history it is
a pill with the face, the name, and "again" (`PlayLine` in
`MessageList.tsx`, also used for DMs); clicking replays it locally. Under
"reduce motion" nothing runs and the pill is all there is.

**Two ways in.** Type `/` at the start of the box and the same list that
does `@names` and `:emoji:` shows the commands with faces
(`commandQueryAt`, `commandOffers`). Or the face button beside Send opens
`components/Spawner.tsx`, the board: every character, one click sends.
A click from the board leaves a half-typed draft and its files alone.
`/shrug`, `/tableflip`, `/unflip` are text commands, replaced in the box
before sending (`expandTextCommand`); `/roll` is unchanged (the server
rolls it).

![Tang, mid-room](shots/command-jump.png)

![The board](shots/command-board.png)

![The list](shots/command-list.png)

**Emoji by name.** `lib/emoji.ts`: a hand-picked table of a few hundred
names (`+1`, `fire`, `skull`, the table ones), expanded to the character
before sending, so the wire and the history hold the emoji itself. A
server's own `:name:` wins over the table and stays as the token. The
`:query` list now offers the server's first and then the built-in names,
with the emoji drawn in the row; `emojiQueryAt` allows `+` and `-` and one
character, for `:+1:`. The smiley beside Send opens the reaction picker
(now with a `place` prop) to put one in at the caret. Same in DMs.

**The + after reactions.** Shows on hover after the last reaction (or
while its picker is open), opens the same picker hanging left. lamp's
red-circle screenshot, exactly.

**Styles while editing.** The edit box takes Ctrl+B and friends and has
the four buttons under it, with "Enter to save, Escape to leave it".

**Ham.** `themes.ts` display name only; the id `dusk` stays so nobody's
choice resets. Said so in the changelog.

**Not done:** DMs have the two buttons and the expansions but not the
`/` list under the box (the DM composer has no offers list at all;
adding one is a copy of the channel one). Only the jump sheet is used:
attack, hurt, death and idle exist for every character and are one more
sheet each if he wants `/tang-attack`. No sound with a jump.

**Looked at and released.** He saw it on `localhost:5173` with the seed
passphrase in `shot.mjs`. He said staging first, then live; not released
until he says so. Tests: web 169, server 168. No migration.

**Still open from earlier today:** channel deletion (ask whether he
lacked the permission on lamp's server or could not find the button).

## Commands in DMs, Delete on the right-click, 2026-09-22 (live with the big one)

Wes, after the release: "I don't think it works on dms. I hit / but it
doesn't even show options. Check on than then see what else you want to
work on." Right: the DM composer had the two buttons and the expansions
but no list. Now it has the same `/` and `:` list as a channel, keyboard
and mouse, minus `/roll` (rolled by the server, which cannot read a DM).
`docs/shots/command-dm.png`. Tests 169.

Then, the thing I picked: **Delete channel in the channel's right-click
menu**, two steps, red, only with Manage channels (the server refuses
either way). `docs/shots/channel-menu-delete.png`. If Wes still cannot
see it on lamp's server, he has no Manage channels there and lamp has
to give it; that is the other half of the open question above.

Changelog entry `2026-09-22-dm-commands`. Not released: he has not seen it.

Wes: "Hold off on deploy. We can do a big one next. What else can we
build? Come up with a plan and we can give to sonnet or opus to build."
The plan is the third batch in `docs/briefs/README.md`: five Sonnet
briefs (invite link, polls, events, bookmarks, voice messages) and three
Opus briefs (soundboard, voice changers, initiative tracker), each a
file beside it. The DM commands and the Delete item ship with that
batch.

## The big one, 2026-09-22 night (live 2026-09-23 00:44 ET, client 1790124190233)

Wes: "Wanna fan out and tackle those?" Eight agents, eight worktrees,
all eight merged the same night. Sonnet built the invite link, polls
and bookmarks; Opus built events, voice messages, the soundboard, the
voice changers and the initiative tracker. Migrations 0012 to 0016
(events, bookmarks, polls, trackers, sounds), renumbered on merge by
deleting the branch's migration and running `db:generate` on top of
main, which is the clean way to do it. Tests: server 206, web 207;
`test:voice` all 35 with both voice branches in. Shots: `poll.png`,
`events.png`, `saved.png`, `invite-link.png`, `initiative.png`,
`voice-changer.png`, `sounds-pane.png`. Changelog `2026-09-22-big-one`.

![Polls](shots/poll.png)
![Initiative](shots/initiative.png)

**Things the agents decided that Wes should know:**
- Polls: votes fan out as `poll_update` with only the tally; your own
  picks come back in your own HTTP answer. The brief said to broadcast
  the message, which would have leaked picks. The agent caught it.
- Events: Manage events is a new permission bit (27), not on @everyone,
  so only owner and admins can plan until a role gets it. One-line
  change if the group should all plan. Reminders go from a once-a-minute
  interval in the one server process.
- Soundboard: the LiveKit grant now allows an `unknown` source track
  for anyone with SPEAK (the second audio track). Sounds use MANAGE_SERVER
  like emoji. A server mute blocks the soundboard client-side.
- Voice changers: uses LiveKit's track processor, not a hand-rolled
  swap; the meter shows the raw voice, "Hear it" plays the changed one.
  Robot at 40 Hz ring mod is a guess until someone listens.
- Voice messages: the server's inline type list lacks `audio/webm`, so
  the player fetches bytes itself. Releasing while the browser is still
  asking about the microphone sends nothing.
- Initiative: players cannot remove themselves or press Next on their
  own turn; only the starter or Manage messages. Encrypted channels
  refuse a tracker (the list is plain text on the server).

**Not tried by a person:** any of it. Voice messages, the soundboard in
a real call, and what the voice changers sound like most of all.

**Deployed** with `bash scripts/release.sh` after Wes: "Yea ship it".
The box applied migrations 0012 to 0016 on restart (17 rows in
`drizzle.__drizzle_migrations`; `poll_votes`, `events`, `event_rsvps`,
`bookmarks`, `sounds`, `trackers` all present), health came back, the
worklet is served at `/worklets/pitch-shift.js`.

**The jump fix, shipped in the same release (`1c1dfb0`).** Wes: "only
like the first time someone does one of the jump animations shows to
other people." Not the spam. `Stage.tsx` only played a spawn message
that landed in `selectedChannelId`, and joining voice selects the voice
channel, so after his friends joined the call every jump in #general
went to their history with no animation. The box journal showed both
users taking voice tokens right at the time of the test. Now a spawn
plays for everyone looking at the same server, whatever channel or
voice room is in front; a jump that lands while the window is hidden
waits (three at most, thirty seconds at most) and plays on return; and
`HEARTBEAT_TIMEOUT_MS` went 60s to 100s, because a hidden tab's timers
are throttled to once a minute and the sweep was cutting those sockets.
Could not reproduce headless any other way (dev and production bundle,
two users, spaced and overlapping). `vite preview` on 4173 now proxies
`/api` and `/gateway` so the production bundle can be tested locally;
`shot.mjs` takes `WEB_URL=http://localhost:4173`.

## Session A: backups and password reset, 2026-09-23 night

**Backups: live on the box, no deploy needed.** `infra/box/README.md`
"Backups" has the whole story and the restore steps for a fresh box. Nightly
at 08:00 UTC the box writes `/mnt/vault/backups/scryproof-<time>.tar.gpg`
(database as SQL plus uploads), encrypted to a key made on the PC by
`scripts/backup-key.sh`. Private half at `~/.scryproof-backup/` on Wes's PC
only. First backup, 34.8 MB, pulled with `scripts/backup-pull.sh` and
checked with `node scripts/backup-check.mjs`: 32 tables, 17 migrations, 254
messages, 238 DMs, 23 stored files, none missing, `RESTORE OK`.

Done 2026-09-23: Wes put `~/.scryproof-backup/backup-private-key.asc` in
his password manager (without it, the box's copies are unreadable if the
PC dies). Keep the file on the PC too; restores use it. Pulling is by hand for now; a Windows scheduled task for
`backup-pull.sh` is a change to his PC, so ask first. Destination decided
as the PC (free, his); object storage stays possible later with the same
encrypted files.

**Password reset: committed `fc25098`, not deployed.** From the PC, after
the person asked in person or on a call:

    bash scripts/box.sh reset-password <username>              (add --clear-2fa if the phone is gone too)

Prints a temporary password like `k7mp-2qxv-9hrt`, signs them out
everywhere, sets `users.must_change_password` (migration 0017). Until they
pick a new one the server answers only `me`, `password`, `logout` and
`context` (hook in `app.ts`), and the gateway refuses the socket; the
client shows `NewPasswordScreen`. DMs untouched. Logged, without the
password, to `/mnt/vault/logs/password-resets.log`. The box command
refuses to run until a build with `server/dist/reset-password.js` is
deployed. Test: `server/src/tests/password-reset.test.ts`. Needs a
changelog line when it ships ("If you forget your password, ask Wes...").

## Batch four, 2026-09-22 late (live 2026-09-23 00:00 ET)

Seven briefs in `docs/briefs/` (`screen-share`, `speaking-ring`, `drafts`,
`desktop-menu`, `people`, `account`, `small-wants`), built by agents in
worktrees and merged into main. After merge: `npm test` 208 server + 237
web pass, typecheck clean, build clean, `npm run test:voice` 41 of 41
(including the new two-screens block), `npm run test:dm` all pass (on a
fresh seeded database; the check now opens the DM through the profile
card, which it had not since the card arrived), `npm run test:desktop` all
pass. Changelog entry `2026-09-22-fourth` written. Desktop shell bumped to
0.4.0.

**Two screens at once.** Works in Chrome (the voice check proves it). Live
logs from Wes and his brother's try (both in the desktop app, both "with
sound"): zrhunter's share restarted four times in two minutes, then he
rejoined twice. Leading suspect, not proven: Electron's `loopback` sound is
the whole machine including the call, so two sharers feed each other.
Sound is now a choice, off by default; a share that stops says why; a
frozen screen says "No picture from X". Retest with sound off first; if a
share still dies, the new messages say which side. Still unanswered: what
each of them saw.

**The desktop shell changed** (right-click menu, the share menu's sound
checkbox, window zoom for the interface scale). The app updates only its
web client by itself, so these reach people only when they run the new
installer once. The interface scale shows a download link in an older
shell. Item 13 (the shell updating itself) would end this.

**Other notes from the agents.** Local names skip the DM device-warning
text on purpose (a pet name is the wrong thing to verify against). The
profile card bug was modals stopping `mousedown` on their content, fixed
by listening in the capture phase. The interface scale first set the root
font size, which moved almost nothing because the stylesheet is px; it is
now `webFrame.setZoomFactor` in the desktop app, and a Ctrl and + hint in
a browser. Account settings adds a `patchUser` action to the store
because the two-factor routes do not broadcast a user update.

**Jump "again" for everyone (added after the batch).** Wes: "i can see
when i click it, but others cant and vise verca". It was built that way:
the history line's "again" replayed only on the clicker's screen. Now it
asks the server (`POST /api/messages/:id/replay`, or
`/api/dms/:dmId/messages/:id/replay`), which stores nothing and sends
`spawn_replay` (with the jump's text) to everyone who can read the channel,
or `dm_spawn_replay` (the id only; the server cannot read a DM) to both
people. `Stage.tsx` plays `spawn_replay` exactly like an arriving jump; the
clicker's own copy comes back the same way, so it plays once. Needs Send
Messages, refuses anything that is not a jump, 10 per 30 s per person. If
the request fails it still plays locally. `server/src/tests/replay.test.ts`;
checked with two headless browsers both directions (the check script was a
one-off, not kept). DM path is typechecked, not browser-checked.

**To ship, when Wes says so:**

    bash scripts/release.sh                     (changelog must be dated today; re-date the entry if it is past midnight)
    cd desktop && npm run dist && cd ..
    bash scripts/publish-installer.sh

Then tell the group to download and run the installer once. Password
reset is live from then: `bash scripts/box.sh reset-password <username>`.

## Batch five, 2026-09-23 (live 00:55 ET)

Wes: "come up with the build plan... then ill have you fan out subagents".
Four agents in worktrees from new briefs (`shell-update.md`,
`emoji-search.md`) and the two DM briefs with a 2026-09-23 note each.
Merged in the main session. Tests: server 225, web 247, desktop 36, all
pass; `test:voice` 53/53 (DM call steps included), `test:dm` all pass
(three-person group included) on a freshly seeded database; `test:desktop`
passes. Shots: `docs/shots/emoji-search.png`, `docs/shots/group-dm.png`.

**The shell updates itself.** `npm run dist` also writes
`desktop/release/installer.json` (version, sha256, size, Ed25519 signature
with the client key but its own prefix `scryproof-installer`, so neither
signature passes as the other). `publish-installer.sh` sends both and
checks them; `/download/installer.json` serves it. The packaged app checks
at start and hourly, downloads to `userData/shell-update/`, verifies
(`desktop/src/installer-core.js`), offers "Restart to install" (or "when
your call is over"), then runs it `--updated /S --force-run` and quits.
**Every shell release must bump `desktop/package.json` version** or no app
offers it. The packaged app only ever talks to scryproof.com, so the full
cycle can only be tested after a deploy.

**Fuses** (read back from the built exe): RunAsNode, NODE_OPTIONS and
inspect flags off; cookie encryption, embedded ASAR integrity, only load
from ASAR on; file protocol extra privileges off. Cookie encryption keeps
old plaintext cookies readable (Chromium only decrypts rows that have an
encrypted value), so nobody is signed out; going *back* to 0.4.0 would
sign someone out once.

**Group DMs.** `dm_channels.kind` (`pair` | `group`) and `title`,
migration `0018_flimsy_wolverine.sql`. 3 to 10 people. Add, leave; last
one out deletes it. A newcomer reads from their join. Blocking inside a
group: the server drops the blocked person's key copy for the blocker, the
rest are unaffected. Group names are stored unencrypted (the picker says
so). **Open:** group messages are not signed by the sender's device, so a
member plus a hostile server could forge text under another member's name;
closing it means signing each message (format change, decide later).
Someone removed from a group is not yet pulled out of a running call.

**DM calls.** `POST /api/dms/:dmId/voice/token`, room `dm_<id>`, granted
on `dm_members`; voice state carries `dmId` and goes only to the DM's
members. One call at a time: starting a DM call leaves the channel.
Pair calls are refused across a block; group calls are not (main-session
call, same reasoning as group messages). Two merge bugs fixed here: the
store treated any voice state with no channel as leaving, so nobody saw a
DM call; and a CSS brace lost in the conflict blanked the dev page.

**Emoji search.** Searches `SHORTCODES` and the server's custom emoji.
The list is ~400 hand-picked names, not the full Unicode set; a full set
would need a generated data file (BUILD-ORDER 15b stays half-open).

**To ship, when Wes says so:**

    cd desktop && npm run dist && cd ..       (installer 0.5.0 + installer.json + a signed client)
    bash scripts/release.sh                    (migration 0018 runs on the box)
    bash scripts/publish-installer.sh

Then install 0.5.0 on Wes's PC (`/S`), check signed in and the fuses, and
prove the cycle: bump to 0.5.1, dist, publish, restart his app, watch the
banner and the silent upgrade. Then the group runs 0.5.0 once, for the
last time.

**Shipped 2026-09-23 00:50-00:58 ET** with Wes's go. 0.5.0 built, released
(client 1790138882935), published, installed on Wes's PC with `/S`; fuses
read back from the installed exe as listed. Then 0.5.1 (version bump
only, client 1790139149928) published; Wes's app, restarted, downloaded
and verified it by itself, showed the banner, and on his click upgraded
silently to 0.5.1. Migration 0018 ran on the box (`dm_channels.kind`,
`title` present). The group installs 0.5.1 from /download once; after
that, shell updates arrive by themselves.

**Small fix for the next shell release:** the installer that did the
upgrade stays in `userData/shell-update/` until the next launch, because
the tidy at start runs while the installer process still holds the file.
Run `tidyShellDir()` again a minute after start.

## Encrypted channels, stage 1, 2026-09-23 (built, not deployed)

Wes: "do what we should do" (next on BUILD-ORDER was Session D, M7). Design
first in `docs/channel-e2ee.md`; read it before touching any of this.

**The decision:** no MLS (GAMEPLAN M7 said look again; the look is in the
doc: 25 people, unaudited browser libraries, voice already said no). No new
dependency. One key per channel per epoch, made on a member's device with a
signed commitment, handed device to device with the DM keys, retired lazily
by the server when a holder should no longer read. Every message is signed
by the sender's device, which closes, for channels, the forgery gap group
DMs still have.

**Where it lives.** Crypto: `web/src/lib/channel-crypto.ts` (pure; 12 tests
in `web/src/tests/channel-crypto.test.ts` play a lying server; the signature
and commitment checks were each switched off once to prove the tests fail).
Working half: `web/src/lib/channel-keys.ts` (fetch, open, seal, hand out,
accept). Server: `server/src/routes/channel-keys.ts`,
`server/src/services/channel-keys.ts` (`freshEpoch` is the rotation), and
`checkSeal` in `routes/messages.ts`. Byte layouts both sides sign:
`shared/src/channel-e2ee.ts`. Migration `0019_awesome_the_captain.sql`
(`channel_epochs`, `channel_keys`, `messages.sender_device_id`,
`messages.signature`). The device keys moved from `state/dms.tsx` to
`lib/this-device.ts` so DMs and channels share one device.

**How it reaches the screen.** Gateway events now go through a queue in
`store.tsx` (`prepareEvent`): a sealed message is opened before the reducer,
the listeners or the notices see it, so the rest of the app sees an ordinary
message with text. History pages, pins and the saved list are opened the
same way. `Message.sealed` (client only) says ok / unverified / no-key /
forged / failed; `MessageList` draws each honestly. Notifications for a
sealed message say who, not what.

**Screens.** "End-to-end encrypted" tick in New channel (text only; cannot be
undone). An "Encrypted" button in the channel header opens the lock panel:
who holds the current key, any device waiting to be accepted, and what is
not encrypted. Files, voice messages, /roll, /poll, /init are refused in an
encrypted channel with a reason, and not offered. Shots:
`docs/shots/channel-encrypted.png`, `channel-lock-panel.png`,
`channel-locked-new-device.png`.

**Tests.** `npm test`: server 236 (11 new in `channel-keys.test.ts`), web
259 (12 new). `npm run test:channels` (new: three browsers plus a second
device for Alex) all pass; `npm run test:smoke` 104 pass; `npm run test:dm`
all pass (the device move touched it). Typecheck and build clean. Not run:
`test:voice` (needs local LiveKit; nothing in voice changed) and
`test:desktop` (nothing in `desktop/` changed).

**Also fixed on the way:** editing a message now updates the quote above
every reply to it, in every channel (it used to keep the old wording).
bytea columns were serialized with `row.x.toString('base64')`, which prints
"12,200,7" under PGlite; now `Buffer.from(...)`, as dms.ts already did.

**Friction to watch with real people.** A person's new device has to be
accepted, by anyone in the channel, before it gets the key; and that new
device will not *send* until it believes the device that made the current
key (its owner's old laptop, say). Both are one click in the lock panel and
both are the right call (a server that invents a device must get nothing),
but it is a click nobody has had to make in a channel before. A recovery
phrase typed on the new device skips both.

**Honest limits, in the doc:** no forward secrecy within an epoch (same as
DMs); the server can replay or reorder one of your own signed messages
within the same channel; reactions, reply pointers, mentions, authors and
times are visible to the server.

**To ship, when Wes says so:**

    bash scripts/release.sh          (changelog entry 2026-09-23-sealed is on top; migration 0019 runs on the box)

No installer: nothing in `desktop/` changed, and the app picks up the new
client by itself. After it is live, the M7 done-when: Wes makes an
encrypted channel and sends a line, and the main session runs a
`select content, ciphertext from messages` on the box over ssh (there is no
`box.sh` wrapper for psql yet) so he sees an empty content column and
gibberish. Screenshot it into this file.

**Next:** stage 2, files and voice messages locked in the browser
(`sealFile` in `dm-crypto.ts` is the pattern; the file key rides inside the
sealed body). Stage 3, turn encryption on for an existing channel.

## The push: encryption stages 2 and 3, and Wes's notes, 2026-09-23 (live 12:58 ET)

One batch on top of stage 1, shipped together. **Live 2026-09-23 12:58 ET**, client
1790180431870, all 22 migrations applied, shell 0.5.2 published
(installed apps offer it within the hour).

**Encrypted channels, stage 2: files and voice messages.** Locked in the
browser with a per-file key, the channel id bound into the lock
(`sealChannelFile` / `openChannelFile` in `channel-crypto.ts`). Uploaded as
`POST /attachments?sealed=1`: the server stores `sealed.bin`,
octet-stream, `attachments.sealed = true`. The real name, type, size and key
ride inside the signed, sealed message body (`files`); the client shows a
file only if its id is also among the message's sealed attachments.
`SealedFile.tsx` draws pictures, voice messages and download rows. The server
refuses a readable file in an encrypted channel and a locked one in a plain
channel. Migration 0020.

**Stage 3: switch on an existing channel.** Channel settings, "Turn on
encryption" then "Turn it on for good". One way, Manage channels, audited.
`channels.encryptedAt` (migration 0021); the timeline draws a line there.
Old messages stay readable; editing one seals it and the server clears the
readable copy.

**Group DMs: a member could post in another member's name.** Found while
listing what was left: in a group, every member holds the message key, so
one could re-lock someone else's key with new text. Each person's copy of
the key is now wrapped with the SHA-256 of the ciphertext in its label
(`scryproof/dm/wrap/v2`), so a copy only opens the message it was made for.
Old messages still open (v1); in a group they are tagged "sender not
proven". The attack test fails without the fix (checked by removing it).
**Leaving a group takes you out of its call**, so the key rotates away from
you; the test fails without that fix too.

**The house rule (bigballer), rewritten** (`shared/src/house-rules.ts`):
text is read the way a person reads it (NFKC, accents off, a look-alike
table for Cyrillic/Greek/leet, i and l merged, everything else dropped,
held keys collapsed), then matched. "a big ball of fire" is left alone;
links and mention tokens are skipped. Applied on the client before send and
on the server to channel text, display names, statuses, nicknames and voice
names, so an old client cannot slip past. Encrypted text is only caught on
the sender's device (the server cannot read it).

**Jump limit** says "That is a lot of jumping. Try again in Ns." on the
button, "again", and DM sends, instead of silence.

**From the agents (briefs in `docs/briefs/`), merged:**
- **Share picker** (`share-picker.md`), desktop 0.5.2: the shell sends
  screens and windows with thumbnails; `SharePicker.tsx` draws tabs, live
  previews every 2s, a sound switch. The shell only accepts an id it
  offered. Browser keeps Chrome's picker. Also: `tidyShellDir` runs again a
  minute after start.
- **Emoji browser** (`emoji-browser.md`): every emoji, Unicode data capped
  at Emoji 15.1 (1,898), categories, skin tones, search, recents.
  `scripts/emoji-data.mjs` regenerates `emoji-data.ts`.
- **Wes's notes** (`wes-notes.md`): opens at the bottom (`BottomPin`:
  late-loading pictures were pushing the view up), composer buttons
  centered, Lightbox (click does nothing, wheel zooms, double-click fits,
  backdrop closes), right-click volume menu in a voice channel
  (`VolumeMenu.tsx`).

**Choices the agents made that Wes may want to overrule:**
- Flags show as two letters on Windows (its emoji font has no flags).
  Fixing that means bundling a flag font.
- The right-click volume menu also appears outside a call (it sets the
  saved volume for next time).
- "Mute for me" is volume 0, not a separate switch.
- The share picker preselects the first screen.

![The emoji browser](shots/emoji-browser.png)

**Tests, 2026-09-23 afternoon:** `npm test` server 239, web 291. On a fresh
database: `test:smoke` 104 (it wants an *unseeded* database; seeded, it
fails at "owner can register"), `test:channels` all (new steps: a picture
and a file through a sealed channel, and switching a channel on),
`test:dm` all, `test:voice` 53 (needs `npm run dev:livekit`), `test:desktop`
38 + all. Typecheck and build clean. First runs of the browser checks after
a server restart can time out on a cold Vite compile; the rerun passes.
**Not tried by a person yet:** the share picker in the real app, the emoji
browser, the volume menu, the lightbox.

**To ship, when Wes says so:**

    cd desktop && npm run dist && cd ..       (shell 0.5.2 + installer.json + a signed client)
    bash scripts/release.sh                    (migrations 0019, 0020, 0021 run on the box)
    bash scripts/publish-installer.sh

Nobody runs an installer: 0.5.1 updates itself to 0.5.2. Then the M7
done-when: Wes makes an encrypted channel, sends a line and a picture, and
the main session runs `select content, ciphertext from messages` and a look
at the attachment on the box, so he sees nothing readable. Screenshot it
here.

**How the release went: the box ran out of memory.** The first
`release.sh` failed in the web build with "Failed to query unit state:
Connection timed out": the box has 1 GB and no swap, the app, Postgres and
LiveKit use about half, and the build peaks around 650-730 MB (measured on
the PC, including the minifier). The kernel killed nothing; it thrashed, and
the live site did not answer for a few minutes until the build gave up.
The build of the version that was live needs the same (660-680 MB): we were
already at the edge, not pushed over by this batch. A heap cap
(`NODE_OPTIONS=--max-old-space-size=320` in `02_build.sh`, kept) was not
enough; the second try froze the site again for about 4 minutes. **Fix: a
1 GB swap file on the vault** (`infra/box/remote/80-swap.sh`,
`vm.swappiness=10`). On the vault so paged-out memory is encrypted at rest
(finding 3); `scryproof-unlock` turns it on after mounting, `scryproof-lock`
turns it off before unmounting. The third deploy used 137 MB of it and the
site answered throughout except the usual restart blip. If a build ever
fails this way again, check `swapon --show` first: after a reboot the swap
comes back only with the unlock.

**Next:** the M7 proof. Wes makes an encrypted channel (or switches one on),
sends a line and a picture, then over ssh: `select content, ciphertext from
messages order by created_at desc limit 3` and the attachment row, shown to
him. Screenshot into this section.

## Review of the push, 2026-09-23 afternoon (live 13:26 ET, client 1790184320279)

Two reviewers went over the batch after it shipped. Real findings, all
fixed and deployed with Wes's go ("ok finish up")
(no shell change, no installer):

- **House rule, live bug:** `<bigballer>`, `<:bigballer:1>` and `<@bigballer>`
  passed untouched (the exemption skipped anything in angle brackets; only
  `<@uuid>` mention tokens and links are exempt now). Worse, "a big balance
  sheet", "the big ballet", "big ballroom", "Big Bailey", "a big bale of hay"
  were mangled, and since the server rewrites channel text before storing
  it, permanently. Now a real letter carrying the word on means it is a
  longer word, not the joke; "baller!" and "baller1" still count. Tests
  added for all of these. Known remaining dodge: "big ball er" (the
  ball-of-fire exemption). Anything already mangled in the database stays
  mangled; nothing was, as of 17:03 ET (checked the newest messages).
- Composer: a slowmode wait said "That is a lot of jumping" when the board
  was clicked, and a jump wait said "Slowmode" in the box. `cooldownFor`
  tells them apart.
- Editing an old message in a channel just switched to encryption failed
  silently (editor closed, nothing changed). It now stays open and says why.
- The "encryption turned on" line was drawn above the first *loaded*
  message even when the switch was further up; drawn only between two
  messages we hold now.
- "sender not proven" was shown on your own old group messages. Read the
  signed-in id through a ref: putting `selfId` in `toView`'s deps remade it
  at sign-in and the conversation never finished opening (test:dm caught it).
- Volume menu: Escape did nothing once the slider had focus.
- Picture viewer on a phone had no way to zoom at all after the click was
  removed: a tap now zooms in around the finger, a tap when zoomed fits.
- Attachment refusal wording for a stale client: "This channel is encrypted
  now. Reload the app to send files here."

Not fixed, for Wes to decide or for later:
- Flags category shows letter pairs on Windows (no flag glyphs in Segoe UI
  Emoji). Options: drop country flags on Windows, or bundle a flag font.
- Millisecond race: a plain message posted in the same instant the switch
  is turned on could land after `encryptedAt`. Close it with a re-check in
  the message insert.
- Emoji grid: ~1,900 tab stops, no arrow keys; Escape from the skin-tone
  popover closes the whole picker; share picker focuses the sound switch
  first. Low.
- The lock panel does not say the server sees that a file was sent and its
  size (it does). One clause.
- `desktop/test/share-menu.test.mjs` is not run by the root `npm test`.

Checks after the fixes: `npm test` 239 + 292; `test:channels` 53 pass;
`test:dm` all pass; typecheck and build clean. `test:smoke`, `test:voice`
not rerun (nothing they cover changed).

## Calls like Discord, 2026-09-23 evening (live 15:11 ET, client 1790190599411)

Wes's screenshots and notes after the push went live: "call in dm ui is
kinda bad. Make it look like discord", no new servers for anyone else,
guest access on the nice-to-have list, no profile pictures in calls,
messages stopping halfway across, several streams at once, stream quality
from inside the call, and "a flash or something if someone is calling you,
a small popup... a soft call sound".

- **The call** (`VoicePanel.tsx`, `VoiceStage`): one grid of 16:9 tiles
  for screens and people, sized from the room with a ResizeObserver
  (`tileWidth`, side by side preferred when it costs under a fifth).
  Screens first with a LIVE badge; people show their profile picture
  (`usePeople`) or initials on their accent; name pill with a mute or
  deafen mark; green ring when speaking. Click a picture to make it big,
  others go to a strip; the grid button puts everyone back. A second
  screen appearing while one is big goes back to the grid so both play.
  Round buttons along the bottom: mute, deafen, camera, screen, quality,
  hang up (aria-labels keep the old button names, and `clickButton` in
  voice-check reads aria-labels). Right-click or click a person without
  a camera for the volume menu. The inline slider on tiles is gone.
- **Quality in the call** (`CallQuality.tsx`): share resolution and fps,
  and what you watch (Sharp/Medium/Low), with a link to the full
  settings. A change while sharing is applied live (`retuneShare` in
  `voice-session.ts`: applyConstraints on the capture, encodings scaled
  on the sender). Best effort; the next share uses the choice regardless.
- **Ringing** (`IncomingCall.tsx`): a DM call going from nobody to
  somebody while you are connected and not in it rings: a card bottom
  right with Answer and Ignore, a soft three-note ring every 2.6 s
  (`notify.ts` `ring`, scaled by the notification volume), the window
  title blinking, and a system notification if the window is not in front
  and permission was given. Stops on answer, ignore, the call ending, or
  after 45 s. Silent on Do not disturb. Nothing new goes to the server:
  it reads the voice states it already gets. No taskbar flash: the
  desktop shell has no hook for it and adding one is a new installer.
- **Servers**: only the owner of the first server on the box may make one
  (`canCreateServers` in `services/servers.ts`, enforced in the route,
  sent in `ready` so the + is hidden). On the box that is milky; Lamp's
  server from 2026-09-22 stays theirs. Test: `server-create.test.ts`.
- **Messages** use the full width (the 84ch cap is gone).
- **New channel dialog**: the encrypted tick box sat centred above its
  label (`.field input { width: 100% }`); fixed for both tick boxes, and
  labels in sentence case. The note no longer says files are off in
  encrypted channels.
- **Guest access** written up under "Nice to have" in `BUILD-ORDER.md`.

Found on the way, NOT fixed: when you open a new conversation, your own
other devices are not told until they reconnect (the server sends
`dm_create` to the other person only). Sending it to the opener too broke
`test:dm` (the conversation never opened; a race with `openWith`, not
chased). `voice-check` used to lean on this via a leftover conversation;
it now opens the DM from the profile card.

Checks: `npm test` 240 + 292; `test:voice` 56 pass (new: it rings for
alex, the ring stops once he joins, the quality menu opens);
`test:smoke` 104 pass; `test:channels` all pass; `test:dm` all pass;
typecheck and build clean.

![grid](shots/call-grid.png)
![two screens](shots/call-two-screens.png)
![quality](shots/call-quality.png)
![ringing](shots/call-ringing.png)
![dm call](shots/call-dm.png)

## Who messaged you: faces on the rail, counts in the member list (2026-09-23, not shipped)

![Faces under the DM button, counts beside names](shots/unread-dms.png)

Wes asked for Discord's version. Built:

- **Rail:** every unread conversation (newest first, five at most) shows as
  the person's picture under the @ button, with its message count. A group
  shows its initials in a square. Click opens the conversation.
- **Member list:** a count beside anyone whose pair DM with you is unread.
  Clicking the count opens the DM; the rest of the row still opens the card.
  Offline rows dim everything but the count.
- **The count** is new: `DmChannel.unreadCount`, counted by the server in
  `describeDms` (other people's messages after your read point; reactions,
  deleted messages and people you blocked in a group do not count). Counting
  rows reads no text, so non-negotiable 8 is untouched. The client adds one
  per incoming message and zeroes it on reading to the newest.
  Test: `group-dms.test.ts`, "counts what is waiting".
- Known gap: a message deleted while unread stays counted until the list is
  fetched again (next reload).
- In headless shots the count never clears, because reading needs a focused
  window. It clears in a real one.

- **Profile card types on open** (Wes, same evening): the "Message @name"
  box takes focus when the card opens, so typing starts a DM without a click.
  Only with a mouse (`pointer: fine`); on a phone it would throw up the
  keyboard. Shot typed into it without clicking and the text landed.

Changelog entry is in. Waiting on Wes to say ship.

## Outbound firewall log read, and messages that expire (2026-09-23 late, expiry not shipped)

**Item 18, the firewall log (read only, nothing changed on the box).** Two
and a half days of kernel log (boot 2026-09-21 18:16 UTC to 2026-09-24 02:24):
122 outbound packets blocked. **None was the box starting a connection**: not
one SYN. Every one is the tail of a connection somebody else opened to us
(source port 22, 80, 443 or 5349, flags ACK/FIN/PSH, i.e. late replies after
the connection state was dropped, mostly to ssh and https scanners), plus
IPv6 multicast (MLD) at boot. Nothing listening makes outbound TCP right now;
the only UDP sockets are LiveKit and the DNS resolver.

The catch, stated plainly: outbound 80 and 443 are allowed to anywhere (apt,
certbot, the Node/npm installs need them). So this log proves nothing phones
home over *other* ports, and says nothing about HTTPS. OS timers that use
443: apt, certbot, fwupd-refresh, update-notifier-download. `motd-news` is
already off (`ENABLED=0`); podman has no containers. To close it: add
`ufw allow log out 443/tcp` (logs each new outbound connection) for a day,
then match every destination to apt, Let's Encrypt or fwupd. That changes
the box, so it waits for Wes. BUILD-ORDER 18b.

**Item 20, per-channel message expiry.**

![Messages last, in channel settings](shots/expiry-settings.png)
![The notice under the box](shots/expiry-composer.png)

- `channels.expire_after_seconds` (migration 0022), 0 = forever. Choices are
  `MESSAGE_EXPIRY_CHOICES` in shared: forever, 1, 7, 30, 90 days. The PATCH
  route refuses anything else; the change is audited.
- `services/message-expiry.ts` runs every 10 minutes: deletes the row
  outright (no tombstone), the attachment bytes first, then the row;
  reactions, bookmarks and poll votes go by cascade. Pinned messages expire
  too. Works the same on encrypted channels (it deletes ciphertext). If the
  channel's newest message expires, `lastMessageId` goes to null so the
  channel cannot sit unread with nothing in it.
- Gateway `messages_expire` removes them from open screens, no "deleted" line.
- A reply to an expired message loses its quote line and reads as a normal
  message.
- Settings warn in orange when a save will delete what is already older, and
  say backups keep them up to a month (box keeps 7 nightlies, PC keeps 30).
- Test: `message-expiry.test.ts` (3). `npm test` 244 + 292 pass, typecheck
  clean.
- Not done: DMs. They are E2EE and the item was per channel; a "disappearing
  DMs" switch would be its own piece (the server can delete sealed rows the
  same way, but both people's devices must agree).

Waiting on Wes to say ship, with the DM faces and the card from earlier.

## Hearth plays into Scryproof (2026-09-24, built in the Hearth repo, nothing shipped here)

Hearth (Wes's DM console, `../Hearth`) can now join a Scryproof voice channel
as an ordinary encrypted member and play the master mix. No server change.
The design and the audit against the non-negotiables are in
`Hearth/SCRYPROOF-BRIDGE.md`; the summary and the to-do list are in
`docs/BUILD-ORDER.md`, "Hearth on Scryproof".

What matters on this side:

- `web/src/lib/voice-crypto.ts` and `voice-key-provider.ts` are copied
  byte-for-byte into Hearth. Hearth's smoke suite fails when they drift, so a
  change here means copying again there.
- The gateway and `/api/auth/login` already accept a client with no Origin
  header and a cookie; that is how Hearth signs in. Nothing was loosened.
- Hearth joins with `selfDeaf: true` and `autoSubscribe: false`, so what the
  member list shows (deafened) is what is true (it cannot hear).

Proven with `node scripts/scryproof-bot-check.mjs` (Hearth), 16 of 16 against
local dev + local LiveKit, including the wrong-key sabotage from
`voice-check.mjs`.

![Hearth live in a Scryproof call](shots/hearth-bot-live.png)
![Hearth signed in, picking a channel](shots/hearth-bot-signed-in.png)


## The first install checks out, 2026-09-24 (finding 6 of the hostile-server review)

Signed updates keep the server out of the code members run *after* an install.
The install itself does not: the installer is served by the box
(`/download/Scryproof-Setup.exe`) and is not Windows code-signed, so a lying
server can hand a new member — or anyone reinstalling — a modified one. That
installer carries its own update key, so every later "signed" update would be
the attacker's too. One modified file at the start undoes all the signing after
it.

The cheap fix is a hash published where the box cannot reach it.
`scripts/publish-installer.sh` prints these at the end of a successful publish:

    Installer Scryproof-Setup-0.5.2.exe
      installer  SHA-256: <the installer's sha256>
      update key SHA-256: <the sha256 of desktop/src/update-key.pub.pem>

Paste both into the GitHub release notes, or into a message sent by hand. Not
just in a message that goes through the box, and not only in the release folder
on the PC: the box is what hands the installer out, so a value the box serves
proves nothing. Neither number is a secret — `update-key.pub.pem` is the public
half of the update key.

**Before running an installer**, check it against what Wes published, on
Windows:

    Get-ChildItem "$env:USERPROFILE\Downloads\Scryproof-Setup-*.exe" | Get-FileHash -Algorithm SHA256

That prints the hash of the file that is actually on disk. Compare it,
character for character, with the published one. A different hash means delete
it and do not run it. The update key's hash is for whoever builds releases
(Wes, Alex): it pins which public key the installers are built with, so a key
swapped in the repo shows up as a changed number. Members cannot easily read it
out of an installer; the installer's own hash is the check they can do, and it
covers the key inside.

Why not just code signing: Windows SmartScreen warns about an unsigned
installer already, and a certificate (OV or EV, money every year) would remove
that warning and let Windows itself reject a changed installer at the signature
check. That is Wes's call on cost. Comparing the hash costs nothing, and is the
part that has to happen first.

## The hostile-server fixes, 2026-09-24 (branch `review/crypto-red-tests`, not deployed)

`docs/reviews/2026-09-24-e2ee-hostile-review.md` found eight ways a server that
lies could read or fake encrypted things. This branch fixes all eight in the
code. Nothing is deployed: the box still runs `main`. Wes decides when this
ships.

**What members will notice**

- **Encrypted channels: "Let in".** A channel key now goes only to devices
  someone on the sending device has let in, not to every device the server
  lists. The lock panel (padlock at the top of the channel) shows who is
  waiting, each with a 20-digit safety number, and a **Let in** button. A new
  browser or phone waits until someone lets it in. Until then it sees
  "Locked." for new messages. People who used encrypted channels before the
  update keep the devices they had already seen: those carry over once, on
  first load. A device you let in counts in every channel, and accepting a
  device in a DM or approving one in a call counts too.
  ![The lock panel](shots/channel-lock-panel.png)
- **Compare numbers once.** Out loud, over something the server does not carry
  (in person, a phone call), read your number from the lock panel or a DM's
  "Check keys" button and check it against what the other person sees for your
  device. Matching numbers prove nobody is in the middle. This is the only
  check that catches a server that planted a device before this update, since
  such a device would have carried over.
- **A channel stays encrypted.** Once a device has seen a channel encrypted, a
  server claiming otherwise gets a note in the channel and is ignored.
  Unsealed messages dated after encryption started show as "Not shown:
  nothing here was sealed and signed by the person it names." The same check
  covers reply quotes, search results and saved messages. The device also
  refuses to go back to an older channel key.
- **DMs.** A message is sealed only for members of the conversation, and the
  conversation warns if the server lists a device for someone who is not in
  it. Reactions from devices this device does not trust are not counted. A
  message the server replays while the conversation is open is shown once. If
  the time a message was written differs from the time the server claims by
  more than five minutes, the message says when it was written.
- **Voice.** A server can no longer seat a fake copy of you in a call, and the
  verification code everyone compares is computed over your real key. Under
  the digits, the code box now names whose keys they cover ("Covers: you,
  Alex, Mara."), and says to check that list is who is really in the call.
- **Desktop app.** Server answers the app fetches for itself can no longer run
  script or steer the app window. This needs a new signed desktop build.

**What Wes needs to do**

1. Review, then merge and deploy when ready. The web client changes ship with
   an ordinary web deploy. Nothing on the server changed.
2. Build and sign a new desktop release for the Electron fixes, then publish
   the installer hash off the box (see the section above).
3. Decide on Windows code signing (a yearly certificate). This is optional,
   and the hash check is free.
4. Tell members about "Let in" and comparing numbers before the update lands,
   so a locked message from a new phone isn't a surprise.

**What this does not fix**

- **Removing someone.** When the server reports a removal, the next message
  moves to a new key the removed person does not get. A server that hides the
  removal can keep them on the list. Stopping that needs a membership list
  signed by the people in it (MLS, milestone 7). The lock panel says this.
- **Memory is per browser.** A new browser, or one whose site data was
  cleared, starts with no memory of which channels were encrypted or which
  devices were let in. If the browser's storage cannot be read at all, the
  device cannot use its own keys either, so encrypted channels and DMs are
  locked on it. Plain channels still work, and it refuses plaintext only in
  channels it has seen encrypted since the page loaded.
- **DMs still trust on first sight.** A person's first device is believed
  when first seen, as before, and only a safety-number comparison proves it.
  A server can still withhold or reorder DMs.
- **Who is in a call.** The server decides who is listed in a call. It can
  add a participant nobody has met before, with a key of its own, and that
  participant gets the call's key like anyone else. Everyone's verification
  digits still match, because everyone's list includes it. It shows by name in
  the code box's "Covers:" line, which is read from the call's own key list
  rather than the server's picture of the room, so a hidden listener is named
  there too. The defense is people reading that line. Signed membership would
  fix this along with removals.
- **Plaintext from before encryption was turned on** is shown as the server
  stored it, and is only as trustworthy as the server: it could have written
  or backdated any of it. A server can also make encryption look like it
  started earlier than it did, which hides real old messages behind "not
  shown". It cannot make encryption look like it started later.

**Verification.** Root gate: server 252/252, web 344/344 (including every red
test from the review), typecheck and build clean. Desktop: 44/45; the
push-to-talk test needs `uiohook-napi`, which is missing on the dev machine and
was failing before these changes. Browser checks on fresh databases: channels
56/56, DMs 94/94, voice 57/57. The channel check now has members let each other
in, which is the new behavior; the voice check reads the code box's "Covers:"
line. Every new test was watched failing with its fix removed. The Electron
changes are covered by unit tests but were not run inside Electron. The voice
"approve" path, and the store's wait for the channel memory before judging the
first messages after sign-in, have no automated check.

## Ship review, 2026-09-25 (feature branch only; not deployed)

Reviewed `review/crypto-red-tests` against `upstream/main` at `2cf3edf`,
including the original hostile-server findings. The feature branch is ready
for Wes's review. Main and the live site were not changed.

For the maintainer's Claude agent: read
[`reviews/2026-09-25-maintainer-agent-handoff.md`](reviews/2026-09-25-maintainer-agent-handoff.md)
for the complete finding map, rationale, residual limits and review targets.

The final review found and fixed these gaps:

- Forged channel messages could still display images or recordings, and a
  server could append an unsigned attachment to a valid signed message.
  Forged rows now expose no files; sealed rows retain only encrypted file IDs
  named by the authenticated body, including when reopening cached messages.
- Channel-memory writes could fail silently. Encrypted sends now wait for
  transaction commit and stop on failure; retries persist even the same epoch.
  A failure while merely observing a channel shows a warning to keep the
  window open and repair storage before reloading. An observation that was
  never saved cannot protect a later session.
- Accepting a device in a DM or call left active channels using stale
  acceptance results. Local acceptance now refreshes those results and
  reopens messages marked unverified.
- Accepted channel holders had no visible safety numbers. Every holder's
  device now has its ID and number, including devices carried over from the
  old pin store. The number cache binds both the person and fingerprint.
- The DM key panel omitted your own additional devices and could show a stale
  list. It now includes those devices and refreshes the list on opening.
- The desktop shell version is **0.5.3**, with matching lockfile metadata, so
  a newly built signed installer can update existing 0.5.2 installations.

![Channel holders and their safety numbers](shots/channel-lock-panel.png)

Verification on Node 26.10.0, npm 11.19.1, Chromium 153.0.8010.52 and Electron
44.4.3 on Linux:

| Check | Result |
| --- | --- |
| Root unit suites | Server 252/252; web 348/348 |
| Typecheck and production build | Pass; existing bundle-size warning remains |
| Desktop unit suite under Xvfb | 47/47 |
| Browser channel suite, fresh local database | 58/58 |
| Browser DM suite, fresh local database | 95/95 |
| Browser voice/video/screen-share suite | 57/57, including wrong-key controls |
| Real Electron smoke suite | Pass, including uploads, native PTT and signed updates |
| Hostile API response in real Electron | Headers enforced; API navigation refused; HTML script did not execute |
| Real IndexedDB commit failure | Aborting after put success rejects the write; retry commits |

The Electron smoke used an isolated copy and a throwaway signing key; Wes's
release key was neither needed nor changed. The attachment and persistence
regressions were observed failing before their fixes; disabling acceptance
refresh reproduced the stale verification status. The new DM browser check
caught the stale device-list bug before its fix. The first voice run was
invalidated by development reloads; the stable rerun passed all 57 checks.
The channel panel screenshot was inspected. The storage warning's state was
unit tested and reviewed; disk-full UI behavior was not injected in a browser.

For Wes: merge when ready, deploy the web client, then build and sign desktop
**0.5.3** and publish its installer hash off the box. There is no server change
or migration. The existing limits remain: trust on first use in DMs, membership
lists supplied by the server, and browser code supplied by the server. Windows
installer operation and production TURN were not tested in this review.

## "How Scryproof works" walkthrough: built 2026-09-25, not released

Wes, mid-release of 0.5.3: "Maybe we have like a 1 time 'How the app works'
tutorial at the beginning... in laymens terms... The importance of each
relative item." Eight cards, each pointing at the real part of the screen when
it is on screen (a lit hole in a dimmed page), otherwise centred: welcome,
servers, channels, in a call (the RTT/Jitter/Loss/TURN row and Verify),
what the server can't read (and what it can: who, when, reactions, channel
names), letting a device in, DMs and the recovery phrase, your corner (settings,
menu, the update bar). No sound; Skip, Escape, or Done, and it never comes back
by itself. "How Scryproof works" in the menu behind your name reopens it.

- Shows by itself once to everyone, members from before it shipped included
  (Wes chose this 2026-09-25: "Yea i'm cool with that"). Once per device and
  browser, keyed on `scryproof.walkthrough.v1`.
- Waits for any open dialog (an invite link's Join) to close before showing.
- Not built on `Modal`, so the check scripts' `.modal` selectors never hit it.
  `scripts/shot.mjs` marks it done unless `--walkthrough` is passed.
- Files: `web/src/lib/walkthrough.ts`, `web/src/components/Walkthrough.tsx`,
  `WalkthroughGate` in `App.tsx`, menu item in `UserPanel.tsx`, `main.tsx`,
  styles under `.walkthrough-*`. Test: `web/src/tests/walkthrough.test.ts`.
- Shots: `docs/shots/walkthrough-1.png`, `walkthrough-servers.png`,
  `walkthrough-letting-in.png`, `walkthrough-corner.png`, `walkthrough-phone.png`.
- To release: add a dated changelog entry, then `bash scripts/release.sh`.
  Web only; no desktop shell change.

## Soundboard clipper and per-sound volume: built 2026-09-25, not released

Wes: "Adding a sound should let you clip it so you can pick exactly what the
sound sounds like. And there should be a button to kinda preview the sound so
you can adjust the volume level before adding it. Basically they add the song
and it sets the default volume for that sound. Then others can turn down all
soundboard sounds if they want."

- **Picking a file** (the board's Add sound tile, or Server settings > Sounds)
  now takes any audio the browser plays, a whole song included (up to 50 MB and
  10 minutes; `SOURCE_BYTES`/`SOURCE_SECONDS` in `web/src/lib/sound-cut.ts`).
  The clipper (`web/src/components/SoundClipper.tsx`) shows the whole file as a
  strip and a close-up 30 seconds around the clip; drag either edge or the
  middle, click the strip to jump, arrow keys nudge (shift for a second at a
  time). Play/Stop plays exactly the chosen part with a moving line, at the
  volume on the slider (0 to 200%).
- **Only the clip is uploaded.** It is resampled to 48 kHz, faded 8 ms at each
  cut, encoded with WebCodecs `AudioEncoder` (Opus, 96 kb/s, about 180 KB for
  15 s) and wrapped in Ogg by `muxOggOpus` in `shared/src/ogg.ts`. A browser
  without `AudioEncoder` can still add a file that is already the whole clip
  (`uploadAsIs`), and is told to use the desktop app or Chrome otherwise.
- **The server now checks the length of Ogg uploads** by reading the last page's
  position (`oggSeconds` in `shared/src/ogg.ts`, checksums verified, one stream
  only, Opus or Vorbis), no decoding. Over 15 s is refused `sound_too_long`; an
  unreadable Ogg is refused `not_a_sound`. WebM and MP3 are still bounded by the
  1 MB cap only. The upload is read whole (at most 1 MB) before anything is stored.
- **Per-sound volume.** Migration **0023** adds `sounds.volume` (integer percent,
  default 100, so existing sounds are unchanged). Set by the uploader in the
  clipper; a manager can change it later with the slider beside each sound in
  Server settings > Sounds (`PATCH` takes `name` and/or `volume`, 0 to 200,
  `invalid_sound_volume` otherwise). The player applies it before the clip goes
  into the call (`playSound(url, volume)` in `voice-session.ts`), so everyone
  hears the same level; each listener's own Soundboard volume then scales it.
- Tests: `web/src/tests/sound-clip.test.ts` (selection rules, waveform peaks,
  Ogg written and read back, tampering refused), `server/src/tests/sounds.test.ts`
  (volume stored/defaulted/refused/changed, Ogg length refused, stored bytes
  unchanged). End to end in real Chrome: `node scripts/sound-clip-check.mjs`
  (cuts 12.5 s from a generated song, uploads at 140%, fetches it back
  byte-identical, decodes to 12.50 s, a 20 s cut is refused). It found a real
  bug on the way: Node's `Buffer.slice` is a view, so the checksum check zeroed
  the stored file's checksums. Fixed; the server test now compares stored bytes.
- `scripts/shot.mjs` takes `FAKE_MEDIA=1` for a fake microphone and autoplay, so
  a call (and the soundboard in it) can be photographed.
- Shots: `docs/shots/sound-clipper.png`, `sound-clipper-playing.png`,
  `sound-clipper-board.png` (in a call, playing), `sound-clipper-phone.png`.
- To release: needs a dated changelog entry; migration 0023 runs on deploy. Web
  and server only, no desktop shell change. Anyone on the old web client while
  others upgrade simply plays sounds at 100%.

## Strong noise suppression and the dropdown fix: LIVE 2026-09-25 21:14 ET (client 1790385137643)

Released at Wes's word ("deploy it") with `release.sh`, then
`bonesdeploy site runtime --yes`. **Trap:** runtime rewrote
`/srv/conf/scryproof/nginx.conf` but the per-site nginx
(`scryproof-nginx.service`, which has no reload action) kept serving the old
policy. It took `systemctl kill -s HUP --kill-whom=main scryproof-nginx` on
the box, a graceful reload. After any change to the policy, check the live
header: `curl -sI https://scryproof.com/ | grep -io "script-src[^;]*"`.
Proven live: the header carries 'wasm-unsafe-eval', and a headless Chrome on
scryproof.com loaded the model and got sound through it. Desktop app users
get Standard until shell 0.5.4 ships. The mute work below was stashed for
the release and put back uncommitted afterwards.

![Noise suppression in the voice settings](shots/noise-suppression.png)

**Why.** A friend's microphone ("seth mic goes nutty when he hits his mic")
made a metallic ring every time it was touched. Wes recorded it with OBS
(`Videos\2026-09-25 20-33-20.mkv`, 21 s). The spectrogram shows a thump and
then about two seconds of low tones (around 60 to 80 Hz and 233 Hz) beating
ten times a second. That is steady enough to sound metallic and sudden
enough that the browser's suppression, which only learns steady sounds,
never catches it. Likely a boom arm or stand ringing; that is inference.

**What.** Voice settings has Strong / Standard / Off under Noise
suppression, default Strong. Strong is RNNoise (`@sapphi-red/web-noise-suppressor`
0.4.0, MIT; 0.4.1 is newer than the npm install cooldown allows) running in
an AudioWorklet on the sender's device, before the voice changer and before
encryption. Its two files are served from our own server. Standard is the
browser's. The two are never both on. "Hear it" plays you back through the
same chain.
- `web/src/lib/noise-model.ts`: loads the model, loaded with `import()` only
  when Strong is chosen.
- `MicProcessor` (was `VoiceEffectProcessor`) in `voice-effects.ts`:
  microphone, then model, then changer. Changes are queued one at a time.
- The app's audio context now runs at 48 kHz, which the model needs.
- Models are pooled, not destroyed: the package's worklet listens for
  "destroy" on a port it never starts, so a destroyed one would keep running.

**The policy change.** WebAssembly needs `'wasm-unsafe-eval'` in
`script-src`. It allows compiling WebAssembly and nothing else; eval of
JavaScript stays blocked. Added to the nginx template (both places) and to
the desktop shell's policy. **Deploying this needs
`bonesdeploy site runtime --yes`** as well as the normal ship, or the site
keeps the old policy and everyone silently gets Standard. The desktop app
runs the client under the shell's own policy, so **Strong starts working in
the app only with shell 0.5.4**; until then it falls back to Standard and
the settings say so.

**Proven.** `npm run test:noise` (after a web build) runs the model in real
Chromium under the policy from the nginx template, and checks that under
the old policy it refuses to start. With clips from Wes's recording
(`node scripts/noise-check.mjs <dir of .f32 clips>`): the ring after the
knock drops about 50 dB from a quarter second in; speech changes by 0.3 dB;
the thump itself (the first quarter second) gets through. Synthetic white
noise is treated unevenly (1 to 20 dB between runs), so the no-clips mode
only checks that the model ran. `npm run test:voice`: 57/57 with Strong as
the default. Web tests pass.

**Dropdown fix.** "In call, gear, voice settings, open a dropdown, it kicks
you back to the top." `Modal` re-ran its focus-the-first-field effect
whenever `onClose` changed, and every caller passes a fresh arrow while the
call panel re-renders about once a second. Now it runs once. Proven in a
real call: a focused dropdown lost focus and scrolled from 1252 to 181
within 4 s on the old code, and kept both on the new.

**Not done / not proven.** Nobody has heard Strong on a real call yet. The
first quarter second of a knock still gets through; Discord's Krisp is
better at that. Also in the recording: from 7 s to 11.5 s someone's audio
is cut off hard at 1.6 kHz, which sounds muffled; Strong cut most of that
section too, which suggests it was mostly noise, the "sometimes static /
feedback" in the channel. Unconfirmed.

**Left alone.** Uncommitted mute work from an earlier session (mute and
deafen tones, "you're muted" note, `MuteStatus`, `mute-state.ts`,
`scripts/mute-check.mjs`, `docs/shots/muted-*.png`) is still in the working
tree, untouched and uncommitted. It includes a real fix: pressing
push-to-talk, or talking past the threshold, while muted switched the
microphone back on. Needs a review and Wes's word before it ships.

**From the group's ideas channel, 2026-09-25 (not built):** FullLoaf: "share
game when you share screen, or have the option to do either screen or
game", and "different sounds for joining, calling, dm, and text channel".

## DONE (live 2026-09-26, last section) 2026-09-25 night: the mic-knock blast (Wes: "its better, but def still happens... really research how we could solve this")

**Measured on Wes's recording** (`Videos\2026-09-25 20-33-20.mkv`; the working
copy is `full.wav` in the session scratchpad `rec\`; recut it with ffmpeg if
it's gone):
- Normal speech: 10 ms loudness median -33 dBFS, 90th percentile -22.
- Worst blast at 12.70 s: 10 ms loudness -6 dBFS, peak -0.6 dBFS. That is
  ~27 dB over normal talk. Energy: 19% at 60-100 Hz, 37% at 100-150 Hz,
  plus a broadband burst from 2 to 13 kHz lasting ~120 ms (a plosive pop or
  a rub?). A speech burst follows it.
- Knock thump at 18.66 s: **86% of its energy at 60-100 Hz, peaking at
  79 Hz.** Speech peaks at 140-180 Hz. A 100 Hz high-pass alone should take
  most of a pure knock.
- RNNoise (live now) removes the ring after ~250 ms but passes that first
  quarter second.

**Research (subagent, sources in the transcript):**
- No app publishes a fix for the leading edge. Krisp is documented as not
  handling "very loud or irregular" sounds.
- Chrome removed its own keyboard-click suppressor (M131) and every `goog*`
  constraint (Chrome 134).
- `autoGainControl: true` is AGC2. Its limiter only guards near 0 dBFS and
  has no look-ahead, so AGC can boost a hot mic's knock. Mumble's lesson:
  only let gain rise during speech.
- DynamicsCompressorNode is not a brick-wall limiter: 6 ms pre-delay and
  automatic makeup gain.
- DeepFilterNet3 has a web build (mezonai/mezon-noise-suppression), but it
  is ~24 MB, adds 40 ms, and loads from `blob:` URLs our CSP blocks. It is
  not proven better on thumps.
- Hardware: Windows Mic Boost to 0 dB, a shock mount, sleeve the arm springs.

**Plan being tested (ranked):**
1. Sender side, after RNNoise and before encryption: a 100 Hz high-pass
   plus our own look-ahead limiter ("loudness guard": learns the person's
   talking level, ceiling = level + N dB, 5 ms look-ahead, 120 ms release),
   possibly with a transient ducker.
2. The same guard on the listener side, per incoming voice, so an old
   client or a broken setup can't blast anyone.
3. Only if needed: DeepFilterNet3.

**State of the code (uncommitted, untested):**
`web/public/worklets/loudness-guard.js` is written. Its header claims a
twin `guardBlock` in `web/src/lib/loudness-guard.ts` that does NOT exist
yet: write it (the pattern is `voice-effects.ts` `shiftPitch`) or drop the
claim. The lab script is `lab\lab.mjs` in the session scratchpad: a copy of
`scripts/noise-check.mjs` with a chain-configurable runner (highpass,
rnnoise, compressor, guard). Copy it into `scripts/` to run; it needs
`web/dist` built and a `CANDIDATES` JSON env var. **The first lab run wrote
no output and printed nothing**; debug that first (probably the
`/worklets/` path or an exception swallowed by the `tail`).

**Next:** get the lab producing A-F wavs. Measure each event's peak and
10 ms loudness, and the speech median (it must not move more than ~1 dB).
Pick the chain, wire it into `MicProcessor`
(microphone, high-pass, model, guard, changer), and add the per-voice guard
on the receive mix in `voice-audio.ts`. Extend `test:noise`. Then show Wes
before and after wavs of the 12.70 s blast. Tell Seth about Mic Boost and
Automatic volume. Consider making AGC default off, or letting gain rise
only during speech.

**Update 2026-09-26 00:30 (mic knock):** the lab ran. The first run hung
because a 21 s result is too big for one CDP reply; the lab now stashes
the result on `window` and pulls it back in 500 kB slices. The guard's
tests are in (`web/src/tests/loudness-guard.test.ts`, loads the shipped
worklet in Node; the false `guardBlock` claim is gone). Measured on the
recording: the handling blast at 12.7 s goes from about 27 dB over his
talking to -20 dBFS (gentle, 14 dB headroom) or -24 (firm, 10 dB), with
speech moving +0.4 or -1.7 dB. A plain compressor lifted speech 10 dB and
the ring with it: dropped. The loud moments at 4.0 s and 5.7-5.9 s sit at
150-500 Hz, voice-shaped, so RNNoise passes them; handling or laughing
is unknown. Wes has `Videos\Scryproof mic test\` (original, live now,
gentle, firm) and was asked: gentle or firm, and what were 4 s and 6 s.
**Not wired into the app yet.**

## 2026-09-26: Loaf v2, the bottom bar, the soundboard up front

LIVE 2026-09-26 05:33 ET with the guard (last section). Wes: "for now lets go with 3 and go absolutly
nuts with the effects and alive feel ... make that Loafv2", then "improve
how the soundbaord works and is found. Make it as easy to find as discord",
and the bottom left "hard to see and aren't intuitive".

**Loaf v2** (commit ad29f97). Seven rounds of paintings for FullLoaf
(everything in `Downloads\Campfire theme options\`); he picked the party
at the fire, then Wes picked the lace-cut silhouettes. `imagegen` gained
`--image` (paste a picture into Gemini and ask for an edit), which is what
kept the background identical across the character passes. The effects
are one Ambient word, `camp` (`camp-scene.ts`), every point in the
painting's own pixels mapped through the cover arithmetic: stars only where
the painting is sky (read from the image), moon halo, shooting stars,
birds, two fog bands and low mist, smoke, fire flicker and sparks, the
wizard's crystal (motes, and a cast every 10-20 s), the warlock's violet
wisps, the druid's glow and falling leaves, the wolf's eye (blinks),
fireflies. `shot.mjs` gained `SETTLE_MS` and `BARE=1`.

![Loaf v2](shots/theme-loaf2.png)
![Loaf v2, the scene alone](shots/theme-loaf2-scene.png)

**The bottom bar and the voice dock.** Discord's layout: face, name and
status, then microphone, headphones and a gear (drawn glyphs, 34 px). The
gear is a menu with every setting; the name is status, profile, What's
new, the tour, sign out. Mute and deafen show outside a call and are
remembered (`voicePrefs.selfMute/selfDeaf`), sent with every join and
every rejoin after a drop (which also fixes a rejoin quietly unmuting
you). In a call, `VoiceDock.tsx` sits above the bar: Voice connected,
channel / server, hang up, and big Camera, Screen, Soundboard buttons. The
soundboard is also a button in the call controls.

**The mute work is reviewed and in** (it was sitting uncommitted): tones,
the talking-while-muted note, deafen marks in the sidebar, and the fix
for the gate switching a muted microphone back on. `mute-check.mjs` 10/10,
`test:voice` 57/57, web tests 398. One change to it: the red "Muted"
strip by your name now shows only for a moderator's mute, since the
microphone button itself turns red now.

![In a call](shots/voice-dock.png)
![The soundboard from the dock](shots/voice-dock-soundboard.png)
![Muted before joining](shots/user-bar-premuted.png)

## LIVE 2026-09-26 05:33 ET: the loudness guard, and Strong really on (client 1790415064384, shell 0.5.4)

Wes, going to bed: "do push build / review whatever you need to. You have
full permission." Released with `release.sh` after `cd desktop && npm run
dist`, then `publish-installer.sh`. No infra change, so no `site runtime`.
Everything from the section above went out in the same release.

**The bug found on the way: Strong never ran in a call.** `MicProcessor`'s
first build undid a join it had never made (`inlet.disconnect(cleaned)`),
and Chrome throws on that ("the given destination is not connected"). So
`init` threw, LiveKit never attached the processor, `publishMicrophone`
caught it and sent the plain microphone, and `fallBackIfModelFailed` turned
the browser's suppression on. From the 2026-09-25 21:14 release until this
one, everyone with Strong (the default) got Standard, and with Strong
chosen the voice changers did nothing either. Nothing on screen could tell:
the settings preview builds its own chain, which worked. Proven on the old
code in a real call: `processor: false` with `noiseMode: 'strong'`.
Wes's "its better, but def still happens" after that release was therefore
not the model. Fix: `web/src/lib/audio-graph.ts` `splice` only undoes joins
that exist. `web/src/tests/mic-processor.test.ts` fakes Chrome's rule,
builds all eight choices from nothing and every change between them, and
checks there is exactly one way through, in order; it fails on the old
behaviour (8 of 10). `test:voice` now asks the running call what really
runs (`window.__voice.debugMic()`), because a stage that cannot start
falls back quietly by design.

**The guard.** I chose gentle (headroom 14 dB) without Wes's answer: firm
took the recorded blast only 4 dB lower and pulled talking down 1.7 dB, and
would flatten laughs. The 4 s and 6 s moments are still unexplained (voice-
shaped, 150-500 Hz). `web/src/lib/loudness-guard.ts` explains the numbers.
- Microphone: high-pass 100 Hz (two 12 dB biquads), noise model, guard,
  changer, then encryption. Exactly lab chain D: the 12.7 s blast went from
  -0.6 dBFS peak to -13.4, 10 ms loudness -6.3 to -20.0, talking +0.4 dB.
- Listener side: `OutputMix` puts a guard in front of every incoming
  microphone (not screens, not soundboards) once the worklet has loaded;
  until then the voice goes straight through. So a friend on an old client
  cannot blast anyone. Guard only, no second high-pass.
- One setting, `voicePrefs.loudnessGuard`, default on, "Loudness guard" in
  Voice settings under Automatic volume; it switches both ends, mid-call
  too. "Hear it" plays through the same chain.
- The guard is plain JavaScript, no WebAssembly, so it runs even in a
  desktop shell older than 0.5.4 (checked in `test:noise` under the old
  policy).

**Shell 0.5.4:** only the version bump; the policy line
(`'wasm-unsafe-eval'`) and Trey's `isApiUrl` hardening were already on
main. Installed apps offer it within the hour. `test:desktop` gained two
checks: the app can compile WebAssembly, and the guard loads.

    Installer Scryproof-Setup-0.5.4.exe
      installer  SHA-256: 108d50aea0cf750d43de47dab46546afeacf8c004f3e6b9916e268f24938c2b7
      update key SHA-256: 755f8ba552e2d4aadd36c6a46fdeb085c12abf71f5818df322d65e07ae8ae35a

The update key is unchanged since 2026-09-21. Recorded here, on GitHub, and
off the box. Not yet in GitHub release notes; that is Wes's call.

**Proven.** Web tests 408/408. `test:voice` 60/60 (new: the model and guard
really run on alex's microphone; wes hears alex through his own guard; both
come off and back on mid-call and alex is still heard). `test:noise` all,
including the guard on a made-up knock in real Chromium (-1.9 to -20.3 dBFS
peak, talking 0.1 dB) under the site's policy and the old desktop one.
`test:desktop` all. Live, in headless Chrome on https://scryproof.com: the
header carries 'wasm-unsafe-eval', WebAssembly compiles, the guard worklet
loads (200, application/javascript), and the served bundle holds it.

**Not proven.** Nobody has heard the guard or real Strong on a live call
yet. Seth's knocks are the test: ask Wes whether they are gone. If a knock
still gets through, the next steps are firm (headroom 10) or a transient
ducker. Still to tell Seth: Windows Mic Boost to 0 dB, and turn off
Automatic volume.


## LIVE 2026-09-26 14:03 ET: Loaf v2's new painting, moving fog (client 1790445725879)

Loaf asked for the party facing the fire with their backs to the viewer, in
round 7's "half-lit" style. Rounds 8 and 9 are in `Downloads\Campfire theme
options\`; Wes picked 9D ("smaller"): the party small on a log, backs to us,
the tiefling with no staff. It is `assets/gen/loaf2-b.jpg`, served as
`/backdrops/loaf2.jpg` (no-store, so no rename needed). Gemini's edit mode
changes what one figure does but will not move or resize people; "bigger"
and "circle" only came out as fresh paintings or a crop.

Wes: "for effects for the alive feel. Everything. Then are we able to make
the fog move on the screen? Then maybe have the birds fly by and shooting
stars apear more often." In `camp-scene.ts`, every point re-measured on the
new painting. The fog is now tiles of generated mist texture sliding
sideways (cloud over the moon, two valley banks opposite ways, one across
the clearing, one over the grass) instead of the old faint puffs. Birds:
a flock, pair or lone bird every 4-11 s, high by the moon or small over the
valley. Shooting stars every 3-8 s, one in five followed by a second. The
wolf faces away now, so its eye is gone; the tiefling's violet moved from a
staff to his horns; new: leaves falling from the oak. Web tests 408.

![Loaf v2, the new painting](shots/theme-loaf2.png)
![The scene alone](shots/theme-loaf2-scene.png)

## LIVE 2026-09-26 17:55 ET: the phone pass (client 1790459634095)

Wes: "Layout issues are the main problems right now. Also when I'm on my app
I can't see the other servers I'm in." Then: "lets get to building and
getting it done." Plan and findings: `docs/briefs/phone-fixes.md`.

**The tool.** `node scripts/phone-tour.mjs` photographs ~45 screens on four
phone sizes with real touch input (hold, swipe, back) and measures overflow,
small targets and iOS focus zoom; `python scripts/phone-sheet.py` lays each
screen out across the four phones in `.shots/phone-tour/sheets/`. `--only a,b`
and `--device galaxy` for quick runs. Needs the API and the web dev server up.

**What changed (3 commits, d302bb4, e4b02c1, 1dd2d7f):**
- The servers bug: DMs with nothing open had no ☰, so @ on a phone was a dead
  end. It has one now, and @ leaves the drawer open on the conversation list.
- Press and hold a message (channel or DM) for a sheet: React, Reply, Edit,
  Pin, Save, Copy text, Delete. `lib/hold.tsx`.
- Message box: words full width, buttons in a row under them.
- 16px text boxes on phones (no Safari zoom), safe-area padding, 100dvh.
- Settings pages: tab strip across the top on a phone, page full width.
- Voice: call buttons shrink to fit, readout wraps, soundboard is a sheet.
- Search: whole header on a phone, and results actually open (they went into
  a drawer nothing opened).
- 44px targets in the header, drawers and lists.
- Swipe the drawers (`lib/swipe.ts`), back closes the top layer
  (`lib/back.ts`, one history step for everything open), dialogs and
  settings render in portals and put the drawer away.

**Not checked:** a real phone. Everything above is Chrome pretending to be
one. The on-screen keyboard pushing the message box, pull-to-refresh, and
Safari's own engine (WebKit is installed under `.tools/webkit`, not yet
wired into the tour) are the next things to look at on a real device.

## 2026-09-26 evening: iPhones join calls (LIVE), phone notifications (built, not deployed)

**iPhones in calls, LIVE 18:26 ET (client 1790461473320, commit 438da66).**
`voiceSupport()` only accepted Chromium's `createEncodedStreams`, so every
iPhone (all Safari underneath) was refused with "This browser cannot
encrypt media frames". LiveKit encrypts through `RTCRtpScriptTransform`
there; the check now accepts either. Wes and FullLoaf (iPhone, home-screen
app) confirmed audio and camera both ways. **Hearth copies
`voice-key-provider.ts` byte for byte: its smoke suite will fail until the
copy is refreshed** (Hearth is on hold anyway).

Wes's notes from that call, not built:
- Portrait camera on a phone looks "super zoomed in"; landscape looks
  normal. Suspect: a tall picture cropped into a wide tile (object-fit
  cover). Measure the track's width/height on the receiver before changing.
- Speaker vs earpiece choice on a phone. "Not high prio but would be
  nice." Likely impossible for an iPhone web app (no output routing); check.

**Phone notifications, built and tested, NOT deployed** (Wes asked to see
it first: preview artifact https://claude.ai/artifact/KNQnMtvAdSffu7d47g2YHw).
Brief: `docs/briefs/push.md`.
- Server: `lib/web-push.ts` sends an EMPTY ping signed with VAPID (node
  crypto, no library; relay allowlist so the endpoint cannot be used to make
  the box call anywhere). `services/push.ts` decides: mentions (after
  `pingTargets`) and DMs (not reactions); nobody who has a window
  "attending" (new gateway frame `attention`: visible, focused, and on a
  computer touched in the last 3 min); per-device mutes copied to the
  subscription; subscriptions tied to the session (sign-out stops them).
  What the notification says lives in memory for an hour and is fetched by
  the phone's service worker from `POST /api/push/pending`; never the
  message text. Migration 0024 (`push_subscriptions`).
- Web: `lib/push.ts` (switch, mute sync, clear badge + lock-screen
  notifications on open, attention reporting, tap-to-open), `sw.js` push +
  notificationclick, the switch in Settings, Notifications.
- Proof: `server/src/tests/push.test.ts` (13; the first 10 mutation-checked) and
  `npm run test:push`: real Chrome, real Google relay, the app's own switch,
  quiet while attending, arrives once out of sight. All pass. Chrome is run
  with its own notification UI; with Windows' native ones
  `getNotifications()` returns nothing and toasts land on Wes's desktop.
- **To ship:** `bash scripts/box.sh 90-push-keys.sh` once (makes the key pair
  on the box, into the vault .env, prints only the public half), then the
  normal release. Without the keys the switch says the server is not set up.
- **Decided (Wes, 2026-09-26, after the preview):** "It shouldn't show any
  bit of the message. I'm thinking we even make it more secure. aka someone
  messaged you. or someone mentioned you. or new message in channel.
  Depending on the notifications settings that they have." So the lock
  screen names nobody and no place: `WORDS` in `services/push.ts` is the
  whole vocabulary. One notification per kind (tag `scryproof-<kind>`), the
  newest replacing the last; the icon number counts. Each subscription
  carries the phone's own `mentions` (the mention switch; DMs count as
  mentions) and `messages` settings, migration 0025. `messages` is its own
  per-device switch, "Every channel message too" (`prefs.pushEvery`), off by
  default: Wes said yes to phones defaulting to mentions and DMs only, since
  the desktop default ('unfocused') would buzz for every message. "New
  message in a channel" goes to readers whose phone asked for every message
  and who were not already pinged (`pushToReaders`). No preview text is
  coming, for channels or DMs.
- Not proven: a real iPhone (iOS 16.4+ home-screen app) and a real Android.
  First thing after deploy.

**Local dev database:** force-stopping the dev API corrupts PGlite
(`Aborted()` on the next start). `dev-restart.sh` without `--keep-data`,
then `npm run seed --workspace server`. The broken copy was moved to
`%TEMP%\scryproof-dev-data-broken-*`.

**Wes's to-dos added today** (BUILD-ORDER top): next week = route audit,
backups, Mac/Linux builds. Sound upgrade with a pick-your-sounds artifact
from free high-quality assets.

## 2026-09-26: Lady of the Lake (staged, not released)

Wes: "Got a saved photo. WE can start to make a new theme. Call it Lady of
the Lake. Do the same thing with the Alive effects." The photo is
`Downloads\Lake 3.jpg`, kept as `assets/gen/lake-a.jpg` (736 x 736). Square
and small, so on a wide window it would have been a cropped strip at twice
its size; imagegen `--image` widened it to 1376 x 768 with the middle kept
(`lake-b.jpg`, served as `/backdrops/lake.jpg`).

`themes/lake.css`: deep-water surfaces, turquoise accent, lantern amber for
gold. One Ambient word, `lake` (`lake-scene.ts`), pinned to the painting
like `camp`: 11 lanterns flickering on their own clocks (and the two
reflections painted in the water), moths round the six near ones, mist in
four banks, the tree breathing blue and dropping petals that ring the water
and float, threads of light turning in the fountain's basin, glints and
rings on the surface, a pale koi now and then, wisps over the pool, gold
specks low. And the name: 12-20 s after load, then every 50-100 s, the
front of the pool lights from below and a sword of light rises, holds, and
sinks. The water map (`isWater`) was drawn by hand over the painting and is
tested (`lake-scene.test.ts`). `camp-scene.ts`'s mist now takes a colour.
Web tests 413.

![Lady of the Lake](shots/theme-lake.png)
![The scene, sword up](shots/theme-lake-scene.png)

**Held (Wes, 2026-09-26: "Hold off on that theme. Its fine just don't want
to push now").** Lady of the Lake is taken off the list in `lib/themes.ts`
so a release does not carry it; the files stay. To release: add
`{ id: 'lake', name: 'Lady of the Lake' }` after 'ember', and put back its
What's new entry: "A new theme: Lady of the Lake" / "A flooded stone court
in a forest at night, with a fountain and a small blue tree in the middle
of the pool. Settings, Themes." / "It is alive: the lanterns flicker, moths
circle them, mist drifts through, the tree drops glowing petals that land
and ripple on the water, and now and then a fish slides by under the
surface." / "Wait a minute and watch the front of the pool."

## LIVE 2026-09-27 00:30 ET: channel settings from the list, moving people between calls (client 1790483322586)

Wes: "we need is the ability as a admin to click on each channel and
customize the settings aka who is allowed in and all that stuff. Also i
think an admid should be able to move who is in voice calls kinda like
disc."

**Channel settings** already had everything (name, privacy picker, the
per-role and per-member permission editor, slow mode, lifetime), but the
only door was the gear over an open channel, and opening a voice channel
joins its call. Now every channel row has a gear on hover and Edit channel
on its right-click / hold menu, for Manage channels or Manage roles
(`ChannelSidebar.tsx`). Found on the way: `ChannelSettings` ran a voice
channel's name through the text-channel slug, so its settings opened on
"Unsaved changes" and saving renamed "General" to "general". Fixed; the
server already stored voice names properly.

**Moving people.** Server mute, deafen and disconnect existed on the server
with no button anywhere. New: `POST /api/servers/:id/members/:userId/move`
(`routes/voice.ts`): Move members, outranking them, a voice channel the
mover can see, and the person moved must be allowed in it (View + Connect,
overwrites included), so moving is no way round a private channel. The
server sends `voice_move` to them and then clears them from the old channel
(which rotates its key); the device in that call joins the new one itself,
the ordinary way, so keys are still made only on devices. An old client
that ignores the event is just disconnected. UI: right-click or hold a
person in a voice channel (sidebar or call tile) for Moderator: Mute for
everyone, Deafen, Move to (a list of rooms), Disconnect
(`VoiceModItems.tsx`); or drag them onto another voice channel. The menu is
now portalled to the page: inside the frosted sidebar it was cut off.

Proven: `server/src/tests/voice-move.test.ts` (5: the move and its event
order; no Move members; a channel they may not join; not in a call / not
voice; cannot move the owner). `test:voice` 67/67, new: Wes right-clicks
Alex, Move to, Side room; Alex's own app follows and connects encrypted;
Wes sees him there; General rotates to a key Alex never gets; Alex dragged
back onto General; both on one key again. Server tests 276, web 413. One
earlier `test:voice` run showed 5 failures while I was also running the
server suite and editing a file the dev server hot-reloaded; its log was
cut, so which five is unknown. Three clean runs since, all pass.
Not proven: press-and-hold on a real phone for the new menus.

![The gear on a channel](shots/channel-gear.png)
![A voice channel's settings](shots/voice-channel-settings.png)
![Moving someone](shots/voice-move-menu.png)

## 2026-09-27: kick, two-day invites, moves that refuse instead of drop (built, not deployed)

Wes, after the moderation release: "moving someone who isnt an admin just
disconnects them. Also, let us get to the sounds screen from the soundboard,
at least if you are an admin. Also add an ability to kick someone ... cannot
join again until they get a new invite. also make all invites expire after 48
hours".

**The move that dropped someone.** The box journal (05:19 to 05:22 UTC) shows
every moved person's app taking a token for the new room within a second,
milky and Hamothy included, except LicensedBoxhed, the only one without the
Admins role. His app never asked for the new room. Nothing in the code path
depends on the moved person's roles (checked: gateway intent, token route,
client handler), so the evidence points at his app being from before the
release (no Reload clicked), which the route's own comment said would simply
disconnect him. Inference, not proven: ask him whether he had clicked Reload.
Fix either way: the app now connects with `?follows=move`; the server notes
which device is in the call (`Connection.callChannelId`) and refuses a move
with 409 `outdated_app` ("They need to click Reload now") unless that device
follows moves. Every app from before this release is refused rather than
dropped. `test:voice` 67/67 proves an updated app still follows.

**Kick.** Already existed in Server settings, Members. Now also on the member
list's menu and a call's right-click menu (`KickItem.tsx`, asks twice). New
`kicks` table (migration 0026, backfilled from the audit log): an invite made
at or before someone's last kick is refused for them (403 `kicked`, also on the
invite preview), and still works for everyone else. Kick and ban now take the
person out of voice first (`disconnectFromVoice`), so their app hangs up; before,
the state was dropped silently and their app sat in a dead call.

**Invites.** `LIMITS.inviteLifetimeMs` = 48 h. Choices are 30m, 6h, 1d, 2d;
an old app's `7d`/`never` get 2 days. Migration 0026 clamps every existing
invite; `consumeInvitePreflight` also refuses anything older than 48 h. Account
(instance) invites too.

**Soundboard.** "Manage sounds" at the bottom for MANAGE_SERVER opens Server
settings on Sounds (`ServerSettings start`). Found on the way: the board opened
from the call's button bar was 48 px wide, because `.spawner.soundboard`'s
sidebar-width rule applied everywhere. Scoped to `.voice-dock`.

Tests: server 282 (new `kicks-and-invites.test.ts`, voice-move +2), web 413,
`test:voice` 67/67, typecheck clean. Shots: `docs/shots/member-kick.png`,
`soundboard-manage.png`, `soundboard-dock.png`, `soundboard-to-settings.png`.

## 2026-09-27: Purdle (shipped 2026-09-27, with the kick/invite/move batch)

Wes: "Make a game called purdle that acts like wordle that everyone can play
once a day. make it act like wordle."

- **Rules** in `shared/src/purdle.ts`: Wordle marking (repeated letters
  handled), the day number (Purdle #1 = 2026-09-27, turns over at midnight
  America/New_York), next-word time across clock changes, streaks, share text.
- **Words:** guesses are ENABLE's 8,6xx five-letter words (public domain,
  vendored in `shared/src/purdle-words.ts`, its own entry point so the app
  lazy-loads it as a 43 KB chunk). Answers are 1,208 hand-picked common words
  in `server/src/purdle/answers.ts`, shuffled once with an HMAC of
  SESSION_SECRET (`server/src/purdle/purdle.ts`): the source does not reveal
  tomorrow's word. Changing the list or the secret reshuffles every day.
- **Server is the referee** (`routes/purdle.ts`): `GET /api/purdle/today`,
  `POST /api/purdle/guess`, `GET /api/purdle/servers/:id` (members only). The
  answer is sent only after you finish. Table `purdle_plays` (migration 0027)
  keeps each day's guesses so the board follows you across devices. Finishing
  broadcasts `purdle_done` (tries, solved, streak, never letters) to every
  server you are in.
- **App:** `components/Purdle.tsx` (rail tile under the bell, dot until you
  start today's), `lib/purdle.ts`. Tile flips, shake, win bounce, Wordle
  keyboard colours, result with stats and spread, "Copy result" and "Put in
  #channel" (sets the channel's draft; Composer now follows outside draft
  changes). Wordle's fixed green/gold across all themes on purpose.
- Tests: server 291 (new `purdle.test.ts`, 9), web 413, typecheck clean, web
  build splits the word list. Shots: `docs/shots/purdle-*.png`.
- **`/purdle`** in any message box opens it (`isPurdleCommand` in
  `lib/commands.ts`): client-only, sends nothing, works in encrypted
  channels, and Enter on the suggestion opens it at once. Wes asked how you
  start it ("is it a command?"), so it is one now. `shot.mjs --type` takes a
  newline as Enter. Shots: `purdle-command-offer.png`, `purdle-command-open.png`.
- Not proven: phones (layout shot at 390 px only), and the day turning over
  live at midnight.

## 2026-09-28: Cuntections, all-time boards, the jump limit (LIVE 2026-09-29 00:47 ET, client 1790657124564)

Wes: "make a connections thing too... Call the connections game
cuntections", then "maybe for both of those it shows you like a total
overtime? like how good people are since they started playing", and "when
someone just copy/paste the command for making the dudes jump it still works."
Released at Wes's word ("yea push") with `release.sh`.

- **Cuntections** is Connections: 16 words, 4 groups, 4 mistakes, "one away",
  same puzzle for everyone, turning over at Purdle's midnight. Cuntections #1
  is **2026-09-29** (`CUNTECTIONS.firstDay` in `shared/src/cuntections.ts`);
  if it ships later, the first number anyone sees is just higher.
- **Puzzles:** 40, hand-written, in `server/src/cuntections/puzzles.ts`, each
  checked so the 16 split only one way (two failed that check and were
  fixed). A subagent was asked for 70 and saved nothing in 35 minutes; it was
  stopped and these were written directly. About six weeks of days; add more
  before mid-November. When every puzzle has been used the pool starts over.
- **Which puzzle a day gets** is chosen at random from the unused ones the
  first time anyone opens that day, and kept with its deal order in
  `cuntections_days` (migration 0029). So adding puzzles never moves a day
  that was played, and the source says nothing about tomorrow.
- **Server is the referee** (`routes/cuntections.ts`): a group is sent only
  once found, the rest only once the day is over, and the share grid only
  then. Refuses the same four twice, a word from a found group, and words not
  on the board. Finishing broadcasts `cuntections_done` (mistakes, never words).
- **App:** `components/Cuntections.tsx`, `lib/cuntections.ts`, rail tile
  (four coloured bars) under Purdle's with a dot until you start, `/cuntections`
  in any message box (`gameCommand` in `lib/commands.ts`). Picked tiles hop
  in order on Submit, a miss shakes, a loss brings in the missed groups one at
  a time. Connections' own four colours, fixed across themes.
- **All time** (`components/GameBoard.tsx`): a Today / All time switch under
  both games. Everyone in the server who has finished a day, ranked by wins.
  Purdle: won/played, average tries on wins, streak, best. Cuntections:
  won/played, perfect days, average misses (a loss counts four), streak. Both
  `/servers/:id` routes now return `standings`.
- **Jumps:** a typed or pasted `/<name>-jump` in a channel now takes from the
  same count as "again", 10 per 30 s per person (`JUMP` in
  `routes/messages.ts`); before it was only the 60-a-minute message limit. The
  server cannot read encrypted channels or DMs, so `Stage.tsx` also never draws
  more than 6 crossing at once, whoever sends them.
- Tests: server 309 + new `cuntections.test.ts` (12, including the jump
  limit), web 415, both typechecks clean.

![Playing](shots/cuntections-playing.png)

![Finished, with the share grid](shots/cuntections-done.png)

![All time](shots/cuntections-all-time.png)

![Phone](shots/cuntections-phone.png)

**Box access, 2026-09-28.** Wes gave Matt (Lamp) root on the box: his key
`mattmascolo@gmail.com` (SHA256:06LO97gP35u9we2cVCsKZ5wdblTUR0Ho7Igx6cVOqb4)
is in `/root/.ssh/authorized_keys` beside the deploy key, with a backup of the
old file next to it. Wes chose root over a limited login after being told what
root can see and change. To remove it: `sed -i '/mattmascolo/d'
/root/.ssh/authorized_keys` on the box.

---

## Four more daily games and a games folder (built 2026-09-29)

Wes, 2026-09-29: "Spelling be", then "queens travle and thrice. Then lets put those basically in like a folder at the top left", then "and bee. you get the naming construct lol".

Runs on the dev copy. Waiting on Wes to play them and say push. Nothing here is on the box.

| Game | Code name | What it is | Score | Puzzles come from |
|---|---|---|---|---|
| Smelling Pee | `bee` | Spelling Bee. Seven letters, the middle one in every word. Open all day. | Points, ranks up to Genius then Golden shower | Made from the word list on the day (`server/src/bee/`) |
| Queefs | `queens` | Queens. One queen per row, column and colour, none touching. | Time, kept by the server | Made on the day, always one answer (`server/src/queens/queens.ts`) |
| Travhole | `travle` | Travle. Join two countries by naming the ones between. | Guesses beyond the shortest way | Two countries picked on the day from the border map |
| Threeway | `thrice` | Thrice. Five questions, three clues each, 3/2/1 points. | Out of 15 | **Hand-written**: 20 days in `server/src/thrice/questions.ts` |

**The folder.** `web/src/components/Games.tsx`. One tile in the rail replaces the three game tiles. It carries a count of today's games not started, and opens a list of all six with where you stand in each. A new game is a new entry in `GAMES` there. Commands: `/pee`, `/queefs`, `/travhole`, `/threeway` (the plain names work too).

**Names are one line each**: `name` in `shared/src/bee.ts`, `queens.ts`, `travle.ts`, `thrice.ts`.

**Vendored data, nothing fetched at runtime:**
- `server/src/bee/words.ts`: SCOWL (permissive, notice kept in the file) sizes 10 to 40 as the common list a day is scored against, SCOWL 50 to 70 and ENABLE (public domain) as "deep cuts" that score but are not needed, plus about 90 crude and gamer words added by hand. No board has an S.
- `shared/src/travle-countries.ts`: borders from mledoze/countries (ODbL 1.0). 198 countries, 158 with a land border.
- `web/src/lib/travle-map.ts`: outlines from Natural Earth 1:50m (public domain), thinned to 223 KB and loaded only when Travhole opens.

**Migrations:** `0030` (bee), `0031` (queens, travle, thrice). Two tables a game: the day's puzzle, and each person's play.

**Tests:** server 338 pass (`bee.test.ts` 14, `games.test.ts` 15), web 415 pass, typecheck clean.

**Shots:** `docs/shots/games-folder.png`, `bee-*.png`, `queens-playing.png`, `travle-playing.png`, `thrice-playing.png`.

![The games folder](shots/games-folder.png)

**Before it ships:** a changelog entry dated the day of the release (release.sh insists), and Wes's word.

**Owed later:** Threeway runs out of fresh questions after 20 days and then repeats; it needs more written, by me or by the group. Queefs' drag-to-cross has been tried with a mouse only by reading the code, not on a real phone.


## Games stocked through the end of the year (2026-09-29)

Wes asked for every game to be filled so nobody has to think about it until the new year.

| Game | Stock | Runs out |
|---|---|---|
| Purdle | 1,208 words | 2030 |
| Cuntections | 105 puzzles (was 40) | after 2027-01-11, then repeats |
| Threeway | 105 days, 525 questions (was 20 days) | after 2027-01-11, then repeats |
| Smelling Pee, Queefs, Travhole | made fresh each day | never (400 days simulated, no repeats) |

- Threeway: the 425 new questions were written, then every file was fact-checked with web lookups, the
  original 100 too. About 35 clues or accepted answers were corrected. A day is one question from each of
  five letter ranges, so a day's answers never share a first letter.
- Threeway's matcher was tightened: a slip is forgiven only in answers of six letters or more and never in
  the first letter (Wario is not Mario).
- The tests now fail if either hand-written list drops under 100.
- To add more later: puzzles go on the end of `server/src/cuntections/puzzles.ts`, questions on the end of
  `server/src/thrice/questions.ts`. Days already played never move.
- Next refill is due before 2027-01-11.

## The deploy that froze the site (2026-09-29 09:53 to 10:12 ET)

The first deploy of the games ran the box out of memory during the server build. The site stopped
answering for 18 minutes until the kernel killed esbuild (697 MB), the build failed, and the old
release carried on. Nothing was lost; the old release was never replaced.

- Cause: `server/src/bee/words.ts` was two strings each written as about 2,000 lines joined with `+`.
  esbuild took 881 MB to bundle that one file (measured on the PC). Written as an array of lines with
  `.join('')` it takes 13 MB. Same words, checked: 14,664 and 31,730.
- The second deploy at 10:14 went through with only the usual few seconds of restart.
- Rule from this: never vendor a big string as a `+` chain. Use an array joined, or one literal.
- The `NODE_OPTIONS` heap cap in `02_build.sh` does not cover esbuild, which is not Node. A build that
  needs more than the box has still freezes the live site. Building off the box would end that for good.

## How to play, on every game, and a map you can zoom (LIVE 2026-09-29 12:18 ET, client 1790698620598)

Wes could not finish Queefs and the board gave him no reason: "make sure instructions are pretty clear. Even when you are in the game. And the travl one i feel like you should be able to zoom in".

- `components/GameHead.tsx` is now the top of all six games: name, a "How to play" button, close. The rules open in the card above the game, which carries on underneath. They are open by themselves the first time a game is opened on a device (`scryproof.rules.<game>` in localStorage). Every claim in the rules was checked against the code that scores it.
- Queefs says so when you are stuck: a row, column or colour with no queen and every square crossed off is named under the board, and red queens get a line saying what red means. It never says which queen is wrong.
- Travhole's map (`Chart` in `Travle.tsx`): plus, minus and Fit buttons, the wheel, a drag to move, two fingers to pinch. A new guess that moves the frame puts the view back.
- Found on the way: anything in a game card could be squashed when the card was fuller than the screen (the Queefs board lost its rows). `.purdle > *` no longer shrinks.

Shots: `docs/shots/game-rules.png`, `docs/shots/queefs-stuck.png`, `docs/shots/travhole-zoom.png`. Typecheck clean, 415 web tests pass. **Not proven:** the pinch and the drag on a real phone; only the buttons were driven in a browser.

## Cleaner game names (2026-09-29, LIVE)

Wes: "Maybe clean up the titles a bit. I like them but don't want to scare off others. Don't have to announce in the whats new". No What's new entry; release with `SKIP_NOTES` not needed today because the newest entry is already dated today.

| Was | Now | Typed |
|---|---|---|
| Cuntections | Conniptions | /conniptions |
| Smelling Pee | Spelling Pea | /pea |
| Queefs | Queenies | /queenies |
| Travhole | Trundle | /trundle |
| Threeway | Third Degree | /degree |

Purdle keeps its name. The top Spelling Pea rank is Queen Bee. Only what people see changed: the names are in `shared/src/*.ts` (`CUNTECTIONS.name` is new), the command list, the composer hint and the older What's new entries. The old commands still open the games but are no longer listed. Routes, tables, files and changelog ids keep the old words, so nothing played is lost. `docs/shots/game-names.png`.

## Click to watch streams (2026-09-29, LIVE)

Ask (a friend, then Wes): a screen share or camera should not play until the viewer clicks it, and "default is muted for watchers".

**Design.** The room connects with `autoSubscribe: false`. Nothing is fetched unless `shouldSubscribe()` (new pure file `web/src/lib/stream-watch.ts`, tests in `web/src/tests/stream-watch.test.ts`) says so: microphones and the soundboard always; a camera, a screen and its sound only after this viewer pressed Watch (and a hidden camera never). `VoiceSession.syncSubscriptions()` applies the rule to every remote publication on connect, on TrackPublished, on ParticipantConnected, and after every Watch / Stop watching / Hide. Each `VoiceVideo` now carries `state` ('waiting' card | 'loading' | 'playing') and `soundOn`. Screen sound joins the mix at volume 0 and only follows the saved volume once the speaker button is pressed; a share ending resets it, so each new share starts muted.

**Behaviour.** Card ("Sharing their screen" / "Camera on" + Watch) until pressed; then Starting..., then the picture. A share starting never takes the stage: only a screen that is playing can be big, and Watch on the first one makes it big (a second Watch puts everything back in the grid, as before). Screen sound starts muted; the speaker button (on the tile, and in the big picture's bar next to the slider) turns it on and the saved per-person volume applies from then. Stop watching (tile, big picture bar) goes back to the card and unsubscribes. Hide for me still works (it also stops watching); Show counts as Watch. Watch state and sound reset when that share is unpublished or the person leaves, so each new share is a new card, muted. Mics and the soundboard are subscribed by hand, so they still play by themselves. Your own preview is untouched. Stalled-screen detection only looks at screens being watched. E2EE and adaptiveStream/capPicture untouched.

**Files.** New: `web/src/lib/stream-watch.ts` (pure rules), `web/src/tests/stream-watch.test.ts`, `docs/shots/stream-watch.png`. Changed: `web/src/lib/voice-session.ts` (autoSubscribe off, watching/screenSoundOn sets, syncSubscriptions, watch/stopStream/setScreenSound, refreshVideos states, debugSubscriptions for the test), `web/src/components/VoicePanel.tsx` (cards, buttons, stage rules), `web/src/components/glyphs.tsx` (SpeakerGlyph), `web/src/styles.css` (card and tile buttons), `web/src/changelog.ts` (top entry `2026-09-29-click-to-watch`), `scripts/voice-check.mjs` (new checks, tour skipped in shots). The game-rename edits in the tree were left alone.

**Done and verified (2026-09-29).** `npm run typecheck` clean. web tests 426/426, server tests 338/338. `npm run test:voice` (real Chromium x3 + local LiveKit) ALL PASS, 86 checks, including: camera and screen are listed as waiting with `isSubscribed` false and zero packets/frames, the screen did not take the stage, voices still decode; after Watch frames decode (camera 60, screen 60 at 1920px); sound starts off and the speaker toggles it; Stop watching drops to zero packets and Watch again decodes; a second share is a fresh card; the three-person two-screens case needs a Watch each.

**Phone check (2026-09-29, later).** A throwaway two-browser run with the watcher at 390x844, touch on, `(hover: none)` and `(pointer: coarse)` true: 22 of 22 pass after one fix. It found the Stop watching link under a big screen pushed off the right edge by the volume slider; `.voice-focus-bar` now wraps. Also moved the tile's Speaker and Stop watching to the top right (on a narrow tile they sat over the name), put any stalled or held note below them (`.under-actions`), and gave those buttons and Watch a 32px height on a coarse pointer. Camera off and on again: while off it leaves the list, and when it comes back it is still watched and plays (60 frames), no black tile. `npm run test:voice` still ALL PASS (86) after the CSS change, web 426/426, typecheck clean. Shots: `docs/shots/stream-watch-phone.png` (card), `docs/shots/stream-watch-phone-big.png` (big screen with the bar wrapped).

**Live 2026-09-29 15:11 ET**, client 1790708967202, together with the game names; the live bundle carries both. **Not done / unverified.** The sound itself was never listened to (headless is muted; Wes, 2026-09-29: sound worked before, no need). Desktop shell and iPhone PWA not tried on a device; the phone check is Chrome emulating one.

## Stream zoom (2026-09-29) — LIVE 23:11 ET, client 1790737755954

Wes: "Give the option to zoom in on the stream." The big picture in a call (a screen or a camera) zooms: wheel around the pointer, drag to move once zoomed, two-finger pinch, double-click in (2.5x) and back out, and `−` / `NNN%` / `+` in the focus bar next to full screen (the percentage resets). 100% to 800%. Only the viewer's `<video>` is drawn bigger (a CSS transform on `.voice-focus-zoom` inside `.voice-focus-frame`), so the stream, its quality, and the sharer are untouched. Pan is clamped to the picture as actually drawn (`contained()` + `clampOffset()` in `web/src/lib/zoom.ts`), so letterbox black never slides in. Resets when a different stream becomes big. Hook: `web/src/lib/useStreamZoom.ts`, the same arithmetic as the picture viewer.

Proven: `npm run test:voice` ALL PASS (91), including five new zoom checks driven with real CDP mouse input (wheel in to 241% around the pointer, a 60px drag moves the picture exactly 60px, % resets, + zooms, double-click resets). Web 431/431, typecheck clean. The live bundle carries it. `docs/shots/stream-zoom.png`. **Not proven:** pinch on a real phone, and the desktop shell.

Released by stashing the role-mentions WIP (the section above, another session, untouched since 22:09) and popping it back afterward; its files are as it left them, uncommitted.

## Whereabouts and Lowball (2026-09-29/30) — built on branch `games`, NOT deployed

Wes: "Also add a geoguesser and a house price guesser." His choices (asked): photos from **Panoramax** (open CC-BY-SA street-level photos) for the geo game, **real Redfin listings** for the house game, with the catch said out loud first (scraping is against Redfin's terms and the photos are the listing agents'; he accepted it at our small, private scale). Google Street View was never an option: it would put Google in every player's data path (non-negotiable 1) and the CSP blocks it.

**Shape.** Five rounds a day, same for everyone, one guess a round, up to 5000 a round (25,000 a day). Whereabouts: GeoGuessr's world curve, `5000·e^(−km/1492.7)`, full within 1 km. Lowball: by ratio, `5000·e^(−3·|ln(guess/price)|)`, full within 2%. Rules both sides need: `shared/src/rounds.ts`.

**Server.** One engine for both: `rounds_days` (game, day, items) and `rounds_plays` (game, user, day, guesses, score, finished) — migration `0032_rounds_games`. `server/src/rounds/{stock,rounds}.ts`, `server/src/routes/rounds.ts`: `/api/rounds/:game/{today,guess,servers/:id}` and `/api/rounds/photo/:file`. The answer (place, price, source link, credit) is sent only with the guess. A photo is served only for a round reached: any round of an earlier day, today's only up to the one you're on, never one no day has used. File names are random ids and every photo's metadata was stripped, so neither leaks the answer. Tests: `server/src/tests/rounds.test.ts` (8, with a made-up stock).

**Photos.** Not in git, not in the nightly backups. On the PC: `Documents\Scryproof-keep\game-photos\{geo,homes}` (made by `scripts/geo-stock.py` and `scripts/homes-stock.py`, each resumable). On the box: `shared/data/game-photos/` (config `GAME_PHOTOS_PATH`), sent by `bash scripts/publish-game-photos.sh`, which sends only what the stock lists name and swaps the folder in whole. **After a restore to a new box, run it again.** The lists themselves are in git: `server/src/{geo,homes}/stock.json`.

**Web.** `web/src/components/Rounds.tsx`. Whereabouts: the photo zooms like a stream (`useStreamZoom`), the map sits in the corner and grows on hover (a Map button on phones), click to pin, Guess; after, both pins and a line, the true country lit, the credit and a Panoramax link. Travhole's map moved to `MapChart.tsx` (with `onPick`) so both use one. Lowball: photo, thumbnails, facts, a price box that reads 450k / $450,000 / 1.2m. Games folder, `/whereabouts` `/lowball` (also `/geo` `/geoguesser` `/houses` `/homes`), How to play, boards, What's new.

**Dev.** A second copy runs beside the main one: `web/vite.config.ts` now takes `API_PORT` and `WEB_PORT`, so the games worktree ran its API on 8788 and web on 5174.

**Merging into main.** The role-mentions WIP (section above) also made a migration numbered 0032. Whichever lands second has to be regenerated as 0033: delete its `0032_*.sql`, its `meta/0032_snapshot.json` and its journal entry, then `cd server && npx drizzle-kit generate --name <name>`.

**Trundle, three routes a day** (Wes, 2026-09-30: "add 3 daily things of the trable things a day"; read as three Travhole routes a day). Same branch. `travle_days` and `travle_plays` gain `leg` (0-2) in their primary keys, migration `0033_travle_three_a_day`, **hand-written**: drizzle-kit crashed on the composite key change until the new key was named, then put the `ADD CONSTRAINT`s before the `ADD COLUMN`s and could not name the old `travle_days_pkey`. Every route already played becomes leg 0. `today` opens the first unfinished leg (`?leg=` asks for another), `guess` takes `leg`, no country pair repeats across any route, the board shows each person's three, the streak is routes won in a row (a whole day unplayed breaks it). Screen: 1 2 3 at the top, "Next route" after finishing one. Tests: games 16/16, including the migration on a fresh database and a two-route day.

**Lowball is built but switched off** (`ROUNDS_OPEN.lowball = false` in `shared/src/rounds.ts`: routes answer 400/404, the app shows it nowhere). Redfin began answering listing pages with a bot challenge (HTTP 202) after 7 homes, 2026-09-30 ~00:30 ET. The script only stopped on 403/429/captcha, so it sent ~470 more requests into the challenge before it was killed; it now stops on any 202 or challenge page. Wes chose (asked): ship Whereabouts and three Trundles, **retry Redfin slowly the next day**: `python scripts/homes-stock.py --count 650 --delay 8` (~2 h, resumes from `game-photos/homes-state/`, stops at the first challenge). If it is blocked again, do NOT drive a real browser around the challenge; bring Wes other sources. The 7 homes so far are in `server/src/homes/stock.json`. To open it: flip `ROUNDS_OPEN.lowball`, put the Lowball lines back in What's new, `bash scripts/publish-game-photos.sh`, release.
