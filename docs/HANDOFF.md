# Scryproof handoff

Living state. Update this at the end of every working session.

**Last updated:** 2026-09-23, day. **The push: encrypted channels stages 1 to 3, the group DM sender fix, the share picker (shell 0.5.2), the full emoji browser and Wes's notes: LIVE 2026-09-23 12:58 ET** (client 1790180431870, shell 0.5.2 published; last two sections). The box now has swap on the vault (see the last section): two build attempts froze the live site for a few minutes before it did. Next: the M7 proof with Wes. Before that: **Batch five is live** (last section; client 1790139149928, installer 0.5.1 on /download): group DMs, DM calls, emoji search, the shell updating itself, Electron fuses. The self-update was proven on Wes's PC: 0.5.0 by hand, then 0.5.1 downloaded, verified and installed itself; Wes: "seemed to work like you explained". Before that, **batch four is live** (client 1790135803188, installer 0.4.0 on /download), with the password reset and jump-again-for-everyone. Everyone has to run the new installer once for the right-click menu, share-sound choice and interface scale. Wes: nothing deploys without asking him first; he may batch several. Before that, Session A: nightly encrypted backups are running with a restore proven, and the password reset is built. **Wes: nothing deploys without asking him first; he may batch several.** Before that: **next session reads `docs/BUILD-ORDER.md`**: the ranked list of what to build next, from the group's Discord suggestions and the security gaps, with the code facts already checked. Before that: The big one is live (client 1790124190233, last section): polls, events, saved, invite links, voice messages, soundboard, voice changers, initiative, commands in DMs, Delete channel, and the jump-for-everyone fix. Before that, commands and the Meepo characters went live; Wes: "Just jump is fine." Live today: ridge default, the formatting pass, the speaking ring and sharing marks, per-watcher video quality, the moving theme, the house rule, the second batch from lamp's notes (profile card, picture viewer, text styles, phone drawers, installable), the night push (What's new, the dusk theme, the join fix), and Loaf and Forg; see the last four sections.

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
