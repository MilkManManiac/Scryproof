# Scryproof — Game plan and build brief

Written 2026-09-16 for handoff to the build session. Revised the same evening after M1 shipped and the deploy tool was chosen. Background research is in `PLAN.md`; this file is the authority when they disagree. **Current state lives in `docs/HANDOFF.md`** — read that second.

**Revised 2026-09-17: security and privacy review.** Wes made "as secure and private as possible" a top priority. Section 1b is new and the build session reads it before writing any M0 or M3 code. It changed the threat model (1), the media E2EE decision (2), the box checklist (4), and the exit criteria of M0, M3, M6 and M7 (6). The biggest change: **the server no longer generates or sees the voice encryption key.**

**Revised 2026-09-17, later: deviations found while preparing for the box.** Section 2c is new. Three changes to the media side (LiveKit's embedded TURN instead of coturn, signalling through nginx on the same origin, no STUN lookup for the box's address) and a smaller first droplet. Wherever an older section still says "coturn", 2c is the authority.

Wes's three priorities, in his words: **it's ours, our data is secure, and latency.** Everything below is ordered by those.

---

## 0. Where we are (2026-09-18)

- **M1 is done and runs locally, end to end.** Server, client, seed script. Screenshots in `docs/HANDOFF.md`.
- **M2 is done locally.** Roles, channel and category permissions, settings UI, hierarchy reordering, audit log. 50 unit tests on the permission algebra (`npm test`), 62 smoke checks over real HTTP.
- **M4 is built locally: camera and screen share go through the same per-person keys, and `npm run test:voice` shows zero frames decoding with the wrong key.** Never on a real box.
- **M5 is built and unjudged.** Everything in the milestone exists and is tested; it ends when Wes says it does not feel like a clone, and he has not looked at it.
- **M3 holds an encrypted call between three browsers, locally.** `generateChannelKey()` and the `voice_key` event are gone; `web/src/lib/voice-crypto.ts` is the replacement, written up in `docs/voice-e2ee.md` and covered by 59 web tests including a server that cheats. The gateway relay, the LiveKit wiring and the connection panel are built, and `npm run test:voice` proves the call in three real browsers against a local LiveKit 1.13.6, including that the wrong key decodes nothing. M3 is **not** done: it has never run on a real box, the TURN path is untested, and no more than three people have been in a call.
- **The two no-box privacy fixes are done.** Images are stripped of metadata in the client before upload (`npm run test:exif` proves it in a real browser), and a committed `.npmrc` turns off install scripts and holds new package versions for seven days.
- **M0 has not started.** It is blocked on one thing only: a box, which only Wes can buy. The production build is rehearsed locally (`npm run test:prod`), and the box scripts, bonesdeploy runtime and runbook (`infra/box/README.md`) are written. None of them has run on a box, so all of them are unverified.
- **Deploy tool decided: bonesdeploy** (section 2b). Docker and Caddy are gone from this plan.

## 1. What "ours and secure" means here (the threat model)

Write down who we're defending against, because the answer decides the architecture. Revised 2026-09-17 after the security review in section 1b; rows marked **new** came out of it.

| Threat | Do we defend? | How |
|---|---|---|
| The hosting provider (DigitalOcean staff, a subpoena to them, a disk image walking off, a memory snapshot of the running machine) | **Yes, for content** | Voice/video/screen share encrypted end to end with keys **made in the clients, never on the server** (1b, finding 1). Encrypted data volume that stays locked after any reboot until Wes unlocks it (finding 3). Client-side-encrypted backups. A hosting exit path (section 5). Text joins this in M7. |
| **new** — Someone who takes over Wes's DigitalOcean account | **Yes** | That account can reset the root password, mount a recovery disk and snapshot the droplet, so it *is* root. Hardware-key or TOTP 2FA, no SMS, no standing API tokens, no team members. Every one of those panel attacks needs a reboot, and a reboot locks the data. |
| **new** — Someone who takes over the domain (registrar or DNS) | **Yes** | They could point the name at their own box and get a real TLS certificate for it. Registrar 2FA + transfer lock, CAA record pinned to our Let's Encrypt account, WHOIS privacy on. |
| Someone who breaks into the server | **Yes** | Hardened box, no passwords, minimal services, per-service Linux users + AppArmor, secrets off the root disk, short-lived tokens, outbound firewall allowlist, everything logged. And because of finding 1, breaking in does not get them the calls. |
| **new** — A compromised server sending members a poisoned copy of the web app | **Partially in the browser, yes on desktop** | The honest limit of any web app (finding 2). Strict CSP and a published build hash raise the bar. The desktop app (M6) closes it: the code is installed and signed, not fetched from the server on every load. |
| **new** — A poisoned npm package | **Yes** | Small dependency list, exact pins, install scripts off, 7-day release cooldown, `npm ci` only (finding 5). |
| A third-party SaaS quietly getting our data | **Yes, absolutely** | Zero third-party services in the data path. No Clerk/Auth0, no Sentry, no analytics, no Google Fonts, no Cloudflare proxy on media, no Uploadthing. We host every piece. Proven at M0 with the outbound firewall log, not assumed. |
| **new** — Someone watching the network (ISP, coffee-shop wifi) | Content yes, shape no | Everything is TLS or SRTP. They can still see *that* a device is talking to our box, when, and how much. Nothing short of Tor hides that and Tor kills voice. Accepted. |
| **new** — A member's stolen laptop or session cookie | Partially | Sessions are revocable and listed per device; TOTP on login; device identity keys are non-extractable. A thief with an unlocked, signed-in machine is that member until someone revokes it. |
| A bad member of the server (leaks, spam, harassment, recording a call) | Partially | Discord-grade permissions, ban/kick, audit log. Not a cryptography problem: anyone allowed to hear a call can record it. |
| A nation state targeting Wes specifically | No | Out of scope. Say so honestly rather than pretend. |

**Metadata is the part encryption never covers.** The server necessarily knows who is a member of what, who is in which voice channel right now, and who is speaking. The rule is: know it only while it is true, and write down as little as possible (finding 4).

**Text messages: the one real tradeoff.** LiveKit encrypts media frames for us; getting the key to the right people without the server learning it is our job (finding 1), and it is a contained one. Encrypting *text* end-to-end costs real features: no server-side search, no link previews generated server-side, new members can't read history unless someone shares keys, and losing your device means losing your history unless we build key backup. Decision:

- **Phase 1:** text is encrypted in transit (TLS) and at rest (encrypted volume + encrypted DB backups), and the server is ours. The host could in theory read it from the running machine's memory. This is Signal-level for voice, Slack-level for text. **Say exactly that in the UI** — a channel is labelled encrypted only when it is.
- **Phase 2 (planned, not optional):** end-to-end encrypt DMs and any channel flagged "private." The message table already allows the body to be an opaque encrypted blob; the client already renders "Encrypted message" for ciphertext-only bodies. The device identity keys built for voice in M3 are the same keys M7 needs, so M3 pays for half of it.
- Do not use Matrix/Olm. Use the **MLS** standard (RFC 9420) when Phase 2 comes. Library choice is open and gets a fresh look at M7: `ts-mls` is pure TypeScript but its own README says it is unaudited and to "proceed with caution"; OpenMLS compiled to WebAssembly is the heavier, better-reviewed alternative.

## 1b. Security review, 2026-09-17

Wes asked for the plan to be checked against "as secure and private as possible, knowing we don't control DigitalOcean." The plan and the code were read against that. Seven findings. The first one is a real design flaw that was already half-built.

### Finding 1 — the server was going to make the voice key. It must never have it.

The old plan said: "per-channel key distributed by our app server over the authenticated WebSocket." The scaffolding does exactly that: `generateChannelKey()` in `server/src/lib/crypto.ts` makes the key and the `voice_key` gateway event hands it out.

A server that makes the key has the key. Anyone who owns the box — an intruder, DigitalOcean under legal process, a memory snapshot — captures the socket and the media and decrypts both. The UI would say "end-to-end encrypted" and it would be true only against people who were never the threat. This is the design Zoom got an FTC order over in 2020. **That scaffolding gets deleted in M3, not extended.**

The replacement, decided:

1. **Device identity key.** On first sign-in a client generates an ECDSA P-256 keypair with WebCrypto. The private half is created non-extractable and lives in IndexedDB; JavaScript can use it, nothing can read it out. The public half is uploaded. One per device, so `users.identity_key` becomes a `device_keys` table.
2. **Joining a call.** The client makes a throwaway ECDH P-256 keypair for this call, signs the public half with its identity key, and announces it over the gateway.
3. **Sender keys.** Every participant makes their *own* random 32-byte media key, wraps a copy for each other participant (ECDH, then HKDF, then AES-GCM), and sends the wrapped copies through the gateway. The server relays bytes it cannot open. LiveKit takes per-participant keys by subclassing `BaseKeyProvider` with `sharedKey: false` (confirmed present in the installed `livekit-client` 2.22.3).
4. **Every membership change rotates.** Someone leaves: everyone still in the call makes a new key, so the leaver hears nothing further. Someone joins: same, so the newcomer cannot decrypt anything recorded before they arrived. For 25 people that is 600 messages of about 100 bytes. Nothing.
5. **Stopping the server from lying about keys.** A hostile server could hand Alex a fake key "for Wes" and sit in the middle. Three defences: throwaway keys are signed by identity keys; each client remembers every identity key it has seen and a changed one is a loud, named warning, never a silent update; and the connection panel shows a short **verification code** derived from the identity keys of everyone in the call. Read it aloud once. If everyone's matches, nobody is in the middle.
6. **No ghosts.** Keys are wrapped only for participants the UI is showing. Anyone in the LiveKit room without a signed key is displayed as unverified, prominently. A listener the members cannot see is a listener without a key.

**Why not MLS for this.** MLS's advantage is that it scales to thousands; at 25 people that buys nothing. The browser options are an unaudited TypeScript library or a Rust-to-WebAssembly build. Pairwise sender keys is the shape Signal uses for groups, is about 200 lines over WebCrypto, and adds zero dependencies — it can be read in one sitting, which is its own kind of security. Discord's DAVE protocol (MLS-based, open, audited by Trail of Bits) is the reference for the parts we borrow: per-sender keys, rotate on every membership change, verification codes.

**Honest note.** This is standard primitives composed by us, and nobody has audited the composition. So it stays small, gets written up in `docs/voice-e2ee.md`, and gets tested the way the permission algebra was: a test plays the malicious server, swaps a key, and the client must raise the warning. If that test cannot fail, it is not a test.

### Finding 2 — a web app's code comes from the server it is trying not to trust.

Every page load, the browser downloads the client from our box. If the box is compromised, the attacker can serve JavaScript that leaks keys before anything is encrypted. No web app escapes this; it is why Signal has no web client.

- **Browser = convenience tier.** Strict CSP (already planned), no inline scripts, no third-party origins, and the build publishes a hash of itself that is also committed to the git repo, so a tampered deploy is *detectable* by anyone who checks.
- **Desktop = trust tier.** The Electron desktop app (M6) must bundle the client inside the installer, not load it from the server. Electron ships its own Chromium, so end-to-end encrypted media (LiveKit E2EE, insertable streams) behaves identically on every machine. (2026-09-21) Updates are signed with a key that lives on Wes's workstation and **never on the box**. Then owning the server does not let anyone change the code members run.
- The UI does not claim more than this. M6's "done when" gains a line for it.

### Finding 3 — the DigitalOcean account is root, so the box must boot dumb.

From the DO control panel anyone signed in as Wes can reset the root password, boot a recovery ISO with our disk attached, or snapshot the droplet. We cannot switch those off. What we can do is make sure every one of them yields nothing:

- **Everything secret lives on the LUKS volume, not the root disk.** Postgres data, uploads, the runtime `.env`, `livekit.yaml` (it holds the API secret), the coturn secret, persistent logs, restic's cache. The root disk holds an operating system and public code. Every service declares `RequiresMountsFor=` the volume, so with the volume locked, nothing starts.
- **The passphrase is never on the box.** Not in a file, not fetched by a boot script. A reboot means the site is down until Wes runs one command from his PC (`scripts/unlock.sh`: SSH in, prompt for the passphrase from his password manager, mount, start services). This replaces the old "fetch it at boot, or accept a human" either/or. The cost is real: a 3 a.m. reboot is an outage until he wakes up. For a friend group that is the right trade, and every panel attack above needs a reboot.
- `unattended-upgrades` stays on with `Automatic-Reboot "false"`. Reboots for kernel updates happen when Wes chooses, monthly.
- Swap off (or encrypted with a random per-boot key). Core dumps off. Both can write secrets from memory onto the unencrypted root disk.
- **No DO Backups, no DO Snapshots** (copies of our disk kept by DO), and remove `droplet-agent` and `do-agent` (DO's console-access and metrics agents) at M0. Record in HANDOFF that they are gone.
- The DO account: unique password, TOTP or hardware key, never SMS. No API tokens left alive after setup. Same for the registrar, GitHub and Backblaze.
- What this cannot stop: reading the memory of the *running* machine from the hypervisor. DO does not sell confidential VMs, and the DDRop attack (September 2026) broke AMD SEV-SNP and Intel TDX against exactly that adversary anyway. The answer to that threat is that the content is not in memory to find — finding 1 for voice, M7 for text — and, later, hardware nobody else shares (section 5).

### Finding 4 — metadata: know it while it is true, keep almost none of it.

- Voice presence lives in memory only (it does today). **No table ever records who was in a call, when, or for how long.** Written down as a rule so nobody adds "call history" without deciding to.
- nginx: access log off for `/api` and `/gateway`; error log only. The default access log is a complete record of every member's IP and activity, and we never planned it.
- LiveKit and coturn at `warn` level. Persistent journald on the encrypted volume, 14-day cap.
- LiveKit tokens carry the opaque user id and channel id only. (Already true: `identity: user.id`. Keep the display name out of the token.)
- Members never learn each other's IP addresses: all media goes through the SFU, never peer to peer. That is a privacy property of the architecture, not only a bandwidth one. Never enable a peer-to-peer mode.
- Deleting a message deletes the row and the file. No soft-delete column. Per-channel auto-expiry ("messages here last 30 days") goes into M8.
- If push notifications are ever built (M8 PWA), they travel through Google, Apple or Mozilla. Payload is "something happened" and nothing else, ever.

### Finding 5 — the npm supply chain.

2026 has had a major npm compromise roughly every two months (Axios in March, Red Hat's namespace in June, AsyncAPI in July). Our dependency list is short on purpose. Keep it that way and add a committed `.npmrc`:

```
ignore-scripts=true
save-exact=true
min-release-age=7
```

Builds use `npm ci` and nothing else, followed by `npm audit signatures`. Updates are deliberate, monthly, reading the diff of `package-lock.json`. Any new dependency has to justify itself in the commit message. A seven-day cooldown alone would have dodged every one of the attacks above.

### Finding 6 — gaps found in the code during the review.

- **Photos carry GPS coordinates.** Uploads are stored untouched, so a phone photo posted in a channel hands every member the poster's location. Fix in the client, before upload: re-encode images through a canvas, which drops all metadata. Client-side on purpose — under M7 the server cannot see the image to strip it. Small, do it next.
- `clientIp()` trusts `X-Forwarded-For`, which is only safe if nginx *overwrites* that header rather than appending to it. One line in the nginx snippet; verify at M0 by sending a forged header.
- Backups: the B2 application key on the box must be created **without delete permission** (CLI only; the B2 web UI cannot make one). An intruder on the box then cannot destroy the backups. Pruning old backups happens from Wes's PC with a second key.
- The GPG key that decrypts `infra/secrets/.env.gpg` exists only on Wes's PC. Back it up to his password manager or a USB stick, or a dead laptop takes the secrets with it.

### Finding 7 — what stays true no matter what we do.

Said plainly so nobody is surprised later: until M7, text is readable from a running server's memory by someone with hypervisor access. Anyone can see that a device talks to our box and when. A member who can hear a call can record it. The browser client is only as honest as the server it came from. Everything else in this section exists to make those four the *only* items on the list.

## 2. Architecture (final)

```
           Wes's friends (browser now, desktop app later)
                 |                          |
        HTTPS + WebSocket                UDP (SRTP, E2EE)
                 |                          |
   +-------------v----------+     +---------v----------+
   |  nginx (TLS, static    |     |  LiveKit SFU       |
   |  client, reverse proxy)|     |  (voice/video/     |
   +-------------+----------+     |   screen share)    |
                 |                +---------+----------+
   +-------------v----------+               |
   |  App server            |     +---------v----------+
   |  Node 22 + TypeScript  |     |  coturn (TURN relay|
   |  Fastify + ws          |     |  fallback only)    |
   |  its own Linux user,   |     +--------------------+
   |  systemd, AppArmor     |
   +-------------+----------+
                 |
   +-------------v----------+     +--------------------+
   |  Postgres 16           |     |  Uploads on disk   |
   |  localhost only, on    |     |  (same encrypted   |
   |  LUKS-encrypted volume |     |   volume)          |
   +------------------------+     +--------------------+
```

One box. Every service is a systemd unit under its own Linux user, provisioned by bonesdeploy. Nothing leaves the box except to the users.

**Locked decisions** (the build session does not relitigate these):

| Concern | Choice | Why |
|---|---|---|
| Media server | LiveKit, self-hosted, Apache-2.0 | Only open SFU with production E2EE, first-party web + desktop SDKs, single Go binary. Stoat and Fluxer both chose it. |
| Media E2EE | LiveKit frame encryption with **per-participant sender keys generated in the clients**, wrapped pairwise (ECDH P-256 + HKDF + AES-GCM, WebCrypto only) and relayed by the gateway as opaque bytes. Custom `BaseKeyProvider` subclass, `sharedKey: false`. Rotated on every join and leave. Device identity keys, pinned on first sight, with a spoken verification code in the connection panel. Full design: 1b, finding 1 | The server forwards ciphertext **and never holds a key**, so owning the box does not get anyone the calls. Firefox-to-Chromium E2EE video is still broken upstream (livekit/client-sdk-js#2103, open as of 2026-09-17): Chromium-based browsers and the desktop app only. **Firefox is refused from voice with a plain explanation; E2EE is never switched off to let it in.** |
| App server | Node 22, TypeScript, Fastify, `ws` for the socket, Drizzle ORM. **LiveKit tokens minted by hand with `node:crypto`**, no server SDK | Same language as the client. Thirty lines of JWT keeps a large dependency out of the process that holds our data. |
| Database | Postgres 16, native, provisioned by `bonesdeploy site services`, bound to localhost, data directory on the LUKS volume. **PGlite in development** (Postgres compiled to WebAssembly; zero installs on Windows, same SQL, same migrations) | Boring, correct, encrypted at rest without a managed-DB third party. |
| Files | **Local disk** under `DATA_DIR` on the encrypted volume (`STORAGE_DRIVER=local`). The S3 driver exists for MinIO later, only if disk cost bites | One fewer service to run and secure. For a friend group, the disk is the right size. |
| Auth | Our own. Argon2id passwords, TOTP 2FA, invite-only registration, sessions in httpOnly cookies, 15-minute LiveKit tokens | No identity provider gets a user list. |
| Client | React 19 + Vite, plain fetch + one store, `livekit-client` and `components-react` for M3 | Web first. Same code ships as an Electron desktop app in Milestone 6. |
| Desktop | Electron | Global push-to-talk hotkey, window capture with audio on Windows. |
| Reverse proxy | **nginx**, provisioned by bonesdeploy; TLS via `bonesdeploy site ssl` | It is what the deploy tool provides. Caddy is out. |
| Deploy | **bonesdeploy** (section 2b) | Systemd + per-site Linux users + AppArmor + cgroups, no Docker daemon, GPG-encrypted secrets, versioned releases with rollback. Written by Alex, who is one message away. |
| Region | DigitalOcean **ATL1 (Atlanta)** | Wes is in Tennessee. Atlanta is the nearest region; expect 15–30 ms round trip from Chattanooga. NYC3 as fallback if ATL1 capacity is missing. |
| Box | Premium AMD 4 GB / 2 vCPU, plus a 50 GB block volume with LUKS | ~$33/mo. LiveKit is CPU-light for audio. |
| Repo | Private GitHub repo `MilkManManiac/Scryproof` | Private until Wes decides otherwise. |

**Explicitly banned:** Clerk, Auth0, Firebase, Supabase, Uploadthing, Sentry (hosted), PostHog (hosted), Google Fonts, any CDN-hosted JS, Cloudflare proxying (DNS-only is fine), Discord-clone tutorial code copied in, `@fastify/static` (dropped over a path-traversal advisory; nginx serves the built client). Every one of these is a third party in the data path.

## 2b. Deploying with bonesdeploy

Repo: https://github.com/AlextheYounga/bonesdeploy. Read its README and run `bonesdeploy skill` (embedded docs written for AI agents) before touching `infra/`.

What it gives us, and why it fits the threat model better than Docker did: each site is its own Linux user with its own systemd service, AppArmor profile and cgroup limits — the same kernel isolation Docker uses, without a root daemon, an image registry or a container runtime in the trust chain. Secrets live GPG-encrypted at `infra/secrets/.env.gpg` and are pushed to a mode-600 `shared/.env` on the box with `bonesdeploy secrets push` (that file has to end up on the LUKS volume, not the root disk: section 1b, finding 3); the encrypted file *may* be committed, which means the session secret and LiveKit keys survive a dead laptop. Postgres is provisioned localhost-only with a per-site credential, reachable from a workstation only over an SSH tunnel. Releases are versioned; `bonesdeploy rollback` is one command.

How Scryproof maps onto it:

- `BONES_TEMPLATE=custom`. The shipped templates are Next/Nuxt/Vue/SvelteKit; we are a plain Fastify process plus a static Vite build. We write our own `deployment/build/` (npm ci, `vite build`, esbuild the server) and `deployment/prepare/` (run migrations) scripts. Expect an hour or two, not five minutes.
- The app server is one systemd unit: `node server/dist/index.js`, binding `127.0.0.1:8787`. nginx serves `web/dist` and proxies `/api` and `/gateway` to it.
- LiveKit and coturn are two more systemd units on the same box. They are Go binaries, not Node, so they may sit outside bonesdeploy's site model as plain units in `infra/custom/`. Decide when we get there; do not fight the tool.
- `bonesdeploy site services` provisions Postgres. `DATABASE_URL` goes into the encrypted secrets.
- LUKS is ours to do, before `bonesdeploy server setup`: attach the block volume, `cryptsetup`, mount at `/var/lib/scryproof` (uploads) and point Postgres's data directory at it. bonesdeploy does not know about disk encryption and should not need to.

**Answered 2026-09-17 by reading bonesdeploy v0.8.7's source: no, and in both of its nginx layers.** The per-site config is ours to write under `infra/custom/`, and ours passes upgrades. The root router on 80/443 is Alex's file and needs a change upstream; `docs/for-alex.md` and `docs/bonesdeploy-router.patch` (untested) are what Wes sends him. The question as first asked, kept for the record:

**Open question for Alex, ask before M0:** does the generated nginx site config pass WebSocket upgrades (`Upgrade` / `Connection` headers, long `proxy_read_timeout`)? Our gateway is a WebSocket. If it does not, the app loads and then silently never updates. If the answer is no, it is four lines in a custom nginx snippet under `infra/custom/`, and we find out now rather than on launch night.

Honest note: it is a friend's tool under active development, and he says so — "sharp edges and perhaps some cool bugs." When it breaks, we are the bug report. That is a fair trade for a deploy path we can read end to end, and the author is a message away.

## 2c. Deviations (2026-09-17)

Decided while preparing for the box. None has been tried on one yet.

- **LiveKit's embedded TURN, not coturn.** LiveKit issues TURN credentials per session itself, so there is no long-lived coturn secret to store, and it is one less daemon to install, pin, gate behind the vault and watch in the firewall log. Same ports: 3478/udp and 5349/tcp, relay range 40000-40999/udp. Where sections 1b, 2, 2b, 3, 4 and 7 say "coturn", read "LiveKit's TURN"; the TURN-usage number in section 3 comes from the connection panel and LiveKit's log instead of coturn's. If embedded TURN turns out not to be good enough on real networks, coturn comes back and this entry says why.
- **LiveKit's signalling goes through nginx, same origin.** `location /rtc` proxies to LiveKit on `127.0.0.1:7880`. The browser only ever talks to one hostname, so the CSP stays `connect-src 'self'`, there is no second certificate, and LiveKit's signalling port is not open to the internet.
- **The box's media address is read off its own network card, not discovered.** LiveKit's `use_external_ip` asks a Google STUN server by default. It carries no member data, but it is a third party the box would contact on every start (non-negotiable 1), and the outbound firewall would block it. A droplet has its public IPv4 directly on the interface, so the installer writes it into `node_ip`.
- **A smaller first box.** 2 GB / 1 vCPU and a 10 GB volume, about $13-15 a month, instead of the 4 GB / 50 GB in the table above. Wes asked to start cheaper. Resize with "CPU and RAM only" so it can be undone. Known risk: with swap off, the build may run out of memory on 2 GB; the runbook lists the ways out.

## 3. Latency plan

Latency is mostly decided by four things, in order of impact:

1. **Distance to the SFU.** Atlanta region. One hop, no relay. This is the biggest lever and it is a checkbox.
2. **UDP, not TCP.** Media must go over UDP ports 50000–60000 straight to the droplet's public IP. TURN over TCP/443 is the fallback for hostile networks only. Never put media behind Cloudflare or a load balancer.
3. **Codec settings.** Opus at 20 ms frames, 48 kHz, DTX on, FEC on, ~48 kbps voice. Simulcast for video and screen share so a viewer on a bad connection degrades instead of stalling. LiveKit defaults get most of this; confirm each in config.
4. **Audio processing.** Browser echo cancellation and noise suppression add ~20–40 ms. Keep them on by default (they matter more than the delay) but expose a "studio mode" toggle for people on headsets.

Targets to measure, not guess:

| Metric | Target | How we see it |
|---|---|---|
| Round trip, client to SFU | < 40 ms from TN/GA, < 80 ms East Coast | LiveKit `ConnectionQuality` and RTT exposed in the voice UI, always visible |
| Mouth-to-ear | < 150 ms | Manual clap test on a call, logged once per milestone |
| TURN usage | < 25% of sessions | coturn logs; if higher, investigate, don't accept |

The **connection panel** (RTT, jitter, packet loss, codec, TURN yes/no) already exists in the voice UI and is on screen during any call. Today it prints an em dash for every number because there is nothing to measure. In M3 it gets wired to real WebRTC stats. It never invents a number. Wes can't diagnose from a guess, and neither can the build session. Instruments, not theories.

## 4. Security checklist for the box (do all of it in Milestone 0)

- SSH: key-only, root login off, non-standard port, `fail2ban`. bonesdeploy's `server setup` does part of this; verify the rest by hand and record what it did in `docs/HANDOFF.md`.
- Firewall (`ufw`), inbound: allow SSH, 80/443 (nginx), 7881/tcp + 50000–60000/udp (LiveKit), 3478 + 5349 (TURN). Deny everything else. Postgres and the app server listen on localhost only.
- Firewall, **outbound: default deny with logging.** Allow DNS, NTP, 80/443 (apt, Let's Encrypt, Backblaze) and the media/TURN port ranges. Then read the log after a day of use. This is the instrument that *proves* nothing on the box phones home — LiveKit, coturn, Node and every npm package included — instead of trusting that it doesn't.
- `unattended-upgrades` on, `Automatic-Reboot "false"`. Node, LiveKit and coturn versions pinned in the build scripts and updated deliberately, not ad hoc.
- LUKS on the block volume, and **the box boots dumb** (1b, finding 3): DB data, uploads, runtime `.env`, `livekit.yaml`, coturn secret, persistent logs and restic cache all live on it; every unit has `RequiresMountsFor=`; the passphrase exists only in Wes's password manager; a reboot needs `scripts/unlock.sh` run from his PC. Test it at M0: reboot, confirm the site is down and the volume is locked, unlock, confirm it comes back.
- Swap off or encrypted per boot. Core dumps off (`kernel.core_pattern`, `LimitCORE=0` on every unit).
- DO hygiene: no DO Backups, no Snapshots, `droplet-agent` and `do-agent` removed, account on TOTP or hardware-key 2FA with no live API tokens. Same 2FA bar for the registrar, GitHub and Backblaze.
- Domain: registrar transfer lock, WHOIS privacy, CAA record restricting issuance to Let's Encrypt (with `accounturi` once the account exists).
- Secrets: `infra/secrets/.env.gpg` in the repo (encrypted), the decrypted `.env` mode 600 **on the LUKS volume** (symlinked into `shared/` if bonesdeploy insists on that path), nothing else. `infra/.env.example` documents every variable. `BONES_*` values never leave the workstation. The GPG private key is backed up somewhere that is not the laptop.
- nginx: `access_log off` for `/api` and `/gateway`; `proxy_set_header X-Forwarded-For $remote_addr` (overwrite, never append — the app trusts this header). Verify with a forged header at M0.
- Committed `.npmrc`: `ignore-scripts=true`, `save-exact=true`, `min-release-age=7`. Build scripts run `npm ci` then `npm audit signatures` and fail on either.
- LiveKit API key/secret rotated quarterly. User-facing LiveKit tokens live 15 minutes and name exactly one room.
- Rate limits on login, registration, message send, invite creation. (Done in M1.)
- Security headers: strict CSP (self only), HSTS, no referrer, no third-party origins at all. Set in nginx, checked with `curl -I` in the M0 handoff.
- Link previews (if ever built) are fetched by the server, never by the client, so members' IPs never leak to the linked site. Same for avatars and embeds.
- Logs: 14-day retention, no message bodies in logs, IPs hashed per boot (done in M1: `hashIp`). LiveKit and coturn at `warn`. No table or log ever records voice-call history (1b, finding 4).
- Backups: nightly `pg_dump` + uploads, encrypted **client-side** with `restic` before leaving the box, to a bucket at a *different* provider (Backblaze B2). B2 only ever sees ciphertext, which is why it is allowed. The B2 key on the box has **no delete capability** (made with the `b2` CLI; the web UI cannot), so an intruder cannot destroy backups; pruning runs from Wes's PC with a separate key. The restic password lives in the password manager as well as on the encrypted volume. Restore test once a month, automated, with a pass/fail line in the admin panel.
- Audit log table: every permission change, ban, kick, channel delete, with actor and timestamp. Visible to server owner.
- Data export: any user can download everything they've posted as JSON. The server owner can export the whole server. "Ours" means we can leave.

## 5. Hosting path (start on DO, keep the exits open)

Wes said he may leave DigitalOcean later. Design for it now so it's a weekend, not a rewrite:

- Everything on the box is reproduced by `bonesdeploy server setup` + `site setup` + `secrets push` + a restic restore onto a fresh encrypted volume. Moving hosts is: new box, run those, change DNS.
- No DO-specific services. No Spaces, no managed DB, no DO load balancer, no DO firewall rules that aren't also in `ufw`.

Where to go when the time comes, ranked:

| Option | Privacy | Latency for the group | Cost | Verdict |
|---|---|---|---|---|
| **Hetzner or OVH bare-metal, US East (Ashburn)** | Full disk yours, no shared hypervisor, still a provider | 20–35 ms from TN | $40–80/mo dedicated | **Recommended next step.** Real hardware, same deploy scripts. |
| Home server behind a VPS "front door" | Physical control of the data | Worse: media bounces through the relay, and residential upload caps it | Hardware + a $6 VPS | Only if physical custody matters more than latency. Fronting VPS sees encrypted packets only. |
| Home server, direct | Full physical control | Depends entirely on Wes's upload and ISP; exposes home IP to every member | Hardware + electricity | **Not recommended.** Voice quality and uptime suffer, and the IP exposure is a bigger privacy hole than DO. |
| Colocation (1U in a Chattanooga/Atlanta DC) | Physical control, DC-grade network | Best possible | $50–100/mo + hardware | The endgame if this becomes something. |

Honest note: with media E2EE done properly (keys never on the server) and a box that boots dumb, the *provider* is already mostly blind. What DO can still reach is the memory of the running machine, which until M7 includes text messages. "Confidential VMs" are not the fix: DO does not sell them, and the DDRop attack (September 2026) broke both AMD SEV-SNP and Intel TDX against a provider with hands on the hardware. The real fixes are M7 (nothing readable in memory) and bare metal (no hypervisor underneath us). **If the privacy priority keeps climbing, the order is: finish M7 first, then move to bare metal.** M7 protects against every host; moving only changes which host.

## 6. Milestones (each ends in something Wes can log into)

The rule from the collaboration manual: no milestone ends in a document. Ship the thing, screenshot it, ask him to poke it.

Order changed from the original brief: M1 and most of M2 were built locally first because they cost nothing and nothing was blocked on a box. M0 is next, the moment there is a box.

**M0 — Infra weekend. NEXT.** Droplet in ATL1, domain, LUKS volume, `bonesdeploy server setup` and `site setup` with the custom template, Postgres, nginx with TLS, LiveKit, coturn, the full section-4 checklist, restic backups to B2. Deploy the *real* app — not the LiveKit sample — since it already exists. *Done when: Wes and one friend sign in at the real domain over HTTPS, chat across two channels from two houses, and `curl -I` shows the security headers. **Plus three proofs from the security review:** a reboot leaves the site down and the volume locked until Wes unlocks it; a day of the outbound firewall log shows no connection we cannot name; a forged `X-Forwarded-For` does not change the IP the app sees. Voice can still be empty.*

**Before M0, no box needed (small, do first):** the committed `.npmrc` from finding 5, and client-side image re-encoding so uploads stop leaking GPS coordinates (finding 6).

**M1 — Text skeleton. DONE (local).** Invite-only registration with TOTP, servers, categories, text channels, real-time messages, edit/delete, uploads, typing, presence. *Done when: Wes and one friend chat across two channels.* Met locally; the real-domain version is M0's exit criterion.

**M2 — Roles and permissions. DONE (local).** Discord's model, faithfully: role bitmasks, `@everyone`, channel overrides with deny-beats-allow, admin bypass, owner bypass, server-side only, 404-not-403 for hidden channels. Remaining: settings UI for roles and per-channel overrides, and the audit log. *Done when: a channel exists that a friend can read but not post in, and the audit log shows who set it.*

**M3 — Voice channels with E2EE. Built and proven locally; not done until it has run on a box.** Join/leave, mute, deafen, speaking rings, who's-here sidebar. **The key agreement is done** (`web/src/lib/voice-crypto.ts`, `docs/voice-e2ee.md`): the old server-side key is deleted, device identity keys are generated and pinned per device, sender keys are wrapped pairwise, every membership change rotates, changed keys raise a named warning, and the verification code is derived from everyone's keys. What remains all needs a LiveKit server: relaying announcements and wrapped keys over the gateway, a `device_keys` table, handing keys to LiveKit through `voice-key-provider.ts`, the verification code and the warnings in the connection panel, and the panel wired to real stats. Join/leave sounds. *Done when: the D&D group runs a full session on it and nobody asks to go back to Discord that night; searching the server's code and memory for a media key finds nothing; and the test that plays a key-swapping server makes the client raise its warning.* The last two are already true — the search finds nothing but a comment saying why, and the suite covers a relay that substitutes keys, re-addresses them, replays them and forges announcements, with four of those defences verified by sabotage.

**M4 — Video and screen share. Built and proven locally; same condition as M3.** Camera tiles, share screen or one window, simulcast, viewer chooses focus, E2EE covers video too. *Done when: someone shares a map and someone else shares a game, both at once.*

**M5 — Feel.** Unread badges, mentions, reactions, replies, link handling, keyboard shortcuts, sounds. Read `references/ai-tell.md` in the milk-project skill before this one. **All of it is built** — see `docs/HANDOFF.md`. Three decisions worth carrying forward: the server resolves mentions and therefore pings nobody in an encrypted channel; there are no link previews, because an unfurl puts a third party in the data path whichever end does the fetching; and a category name is filtered like a channel name, because "staff-only" over hidden channels gives away what hiding them was for. *Done when: Wes says it doesn't feel like a clone.* **Not done: he has not looked at it.**

**M6 — Desktop app.** Electron, global push-to-talk, share a game window with its audio, start with Windows, tray icon. **This is also the trust tier (1b, finding 2):** the client ships inside the installer rather than loading from the server, and updates are signed with a key that lives on Wes's workstation, never on the box. *Done when: Wes plays a game with PTT and never alt-tabs, and replacing the web client on the server changes nothing about what the desktop app runs.*

**M7 — Text E2EE (Phase 2 from section 1).** DMs and private channels via MLS, reusing the device identity keys from M3. Key backup. Attachments encrypted in the client before upload. *Done when: the server owner runs a DB query and cannot read a private channel.* If privacy keeps outranking feel, this moves ahead of M5; it is the only milestone that takes text out of the host's reach.

**M8 — The unglamorous 30%.** Moderation tools, password reset without email (recovery codes), data export, monthly restore test, per-channel message expiry, mobile PWA polish (push payloads carry no content, ever).

Time honesty: M0–M4 are the fun part. M5 and M8 together are as long as M0–M4 combined. That is where this kind of project dies. See `references/the-wall.md`.

## 7. Repo layout

```
Scryproof/
  CLAUDE.md            project rules (non-negotiables from this file)
  GAMEPLAN.md          this file
  PLAN.md              background research
  .env.build           committed, non-secret build inputs (bonesdeploy)
  deployment/
    build/             numbered scripts: npm ci, vite build, esbuild server
    prepare/           numbered scripts: migrations
  infra/
    .env.example       every variable, documented
    secrets/.env.gpg   encrypted runtime secrets (bonesdeploy)
    custom/            our nginx snippets, LiveKit and coturn units
    livekit.yaml
    coturn.conf
    backup.sh          restic to B2
  shared/              types, permission bits, validation — one copy for both sides
  server/              Fastify + ws + Drizzle; src/scripts/seed.ts and smoke.ts
  web/                 React + Vite
  desktop/             Electron (M6)
  scripts/dev-restart.sh
  docs/
    HANDOFF.md         living state for the next session — read it
    shots/             screenshots per milestone
    permissions.md     the bitmask table, kept in sync with code
```

`deployment/`, `infra/secrets/` and `infra/custom/` do not exist yet; `bonesdeploy init` creates them in M0.

## 8. Non-negotiables (mirrored in CLAUDE.md)

1. No third-party service in the data path. If a library phones home, it doesn't ship.
2. Media is end-to-end encrypted from M3 onward. Never "temporarily" disabled.
3. Permissions are computed on the server. The client only hides buttons.
4. Every milestone ends with a URL Wes can open and a screenshot in the handoff doc.
5. One box, one deploy tool, one encrypted volume. Portable by construction: new box, restore, DNS.
6. No Discord-clone tutorial code. Write it, understand it, own it.
7. Every voice UI has the connection panel. Diagnose with instruments.
8. No key that decrypts members' content ever exists on the server. Not generated there, not relayed in the clear, not backed up there. The UI says "encrypted" only where that is true.
9. The box boots dumb. Nothing secret on the unencrypted root disk, the volume passphrase never on the box, and a reboot stays locked until Wes unlocks it.

## Sources

Security review, 2026-09-17:

- LiveKit E2EE, key providers ("LiveKit does not store or transport encryption keys" — distribution is the app's job): https://docs.livekit.io/transport/encryption/
- Discord DAVE protocol (per-sender keys, rotate per epoch, verification codes, ghost-participant defence): https://github.com/discord/dave-protocol/blob/main/protocol.md , https://discord.com/blog/meet-dave-e2ee-for-audio-video
- ts-mls (unaudited, per its README): https://github.com/LukaJCB/ts-mls · OpenMLS: https://github.com/openmls/openmls
- Why browser-delivered E2EE is a weaker trust model: https://tender.run/blog/web-apps-trust-and-integrity , https://zfnd.org/so-you-want-to-build-an-end-to-end-encrypted-web-app/
- DO control-panel root password reset and recovery console: https://docs.digitalocean.com/support/how-do-i-reset-my-droplets-root-password/ , https://docs.digitalocean.com/products/droplets/how-to/recovery/recovery-console/
- DDRop attack on SEV-SNP and TDX (Sept 2026): https://thehackernews.com/2026/09/new-ddrop-attack-breaks-intel-tdx-and.html
- LUKS remote unlock, manual vs Clevis/Tang trade-off: https://techearl.com/luks-remote-unlock-dropbear-ssh
- npm supply chain, cooldowns and install scripts: https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/ , https://github.blog/security/supply-chain-security/disrupting-supply-chain-attacks-on-npm-and-github-actions/
- restic + B2 with a no-delete key: https://medium.com/@benjamin.ritter/how-to-do-ransomware-resistant-backups-properly-with-restic-and-backblaze-b2-e649e676b7fa , https://helgeklein.com/blog/restic-encrypted-offsite-backup-with-ransomware-protection-for-your-homeserver/

Original brief:


- bonesdeploy: https://github.com/AlextheYounga/bonesdeploy
- DO Atlanta region: https://www.digitalocean.com/blog/introducing-new-atlanta-data-center , https://docs.digitalocean.com/platform/regional-availability/
- LiveKit E2EE: https://docs.livekit.io/transport/encryption/ , https://livekit.com/security/overview
- LiveKit E2EE Firefox/Chromium interop bug (Sept 2026): https://github.com/livekit/client-sdk-js/issues/2103
- LiveKit self-hosting: https://fazliev.com/blog/livekit-production-guide
- Stoat and Fluxer (both LiveKit-based): https://en.wikipedia.org/wiki/Stoat_(software) , https://fluxer.app/
- SFU comparison: https://bloggeek.me/webrtc-tools/media-servers-oss/
- DO pricing: https://www.digitalocean.com/pricing/droplets
