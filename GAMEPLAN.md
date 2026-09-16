# GoOffline — Game plan and build brief

Written 2026-09-16 for handoff to the build session. Revised the same evening after M1 shipped and the deploy tool was chosen. Background research is in `PLAN.md`; this file is the authority when they disagree. **Current state lives in `docs/HANDOFF.md`** — read that second.

Wes's three priorities, in his words: **it's ours, our data is secure, and latency.** Everything below is ordered by those.

---

## 0. Where we are (2026-09-16)

- **M1 is done and runs locally, end to end.** Server, client, seed script, 47 smoke checks. Screenshots in `docs/HANDOFF.md`.
- **M2's server side is done and tested.** No settings UI yet.
- **M3 scaffolding exists** (token minting, voice state, key distribution over the socket). No media server yet.
- **M0 has not started.** It is blocked on one thing only: a box, which only Wes can buy.
- **Deploy tool decided: bonesdeploy** (section 2b). Docker and Caddy are gone from this plan.

## 1. What "ours and secure" means here (the threat model)

Write down who we're defending against, because the answer decides the architecture:

| Threat | Do we defend? | How |
|---|---|---|
| The hosting provider (DigitalOcean staff, a subpoena to them, a disk image walking off) | **Yes** | End-to-end encryption for voice/video/screen share so the server never has the plaintext. Encrypted disk. Encrypted, client-side-keyed backups. A hosting exit path (section 5). |
| Someone who breaks into the server | **Yes** | Hardened box, no passwords, minimal services, secrets outside the repo, short-lived tokens, everything logged. |
| A third-party SaaS quietly getting our data | **Yes, absolutely** | Zero third-party services in the data path. No Clerk/Auth0, no Sentry, no analytics, no Google Fonts, no Cloudflare proxy on media, no Uploadthing. We host every piece. |
| A bad member of the server (leaks, spam, harassment) | Partially | Discord-grade permissions, ban/kick, audit log. Not a cryptography problem. |
| A nation state targeting Wes specifically | No | Out of scope. Say so honestly rather than pretend. |

**Text messages: the one real tradeoff.** Encrypting voice end-to-end costs almost nothing (LiveKit does it). Encrypting *text* end-to-end costs real features: no server-side search, no link previews generated server-side, new members can't read history unless someone shares keys, and losing your device means losing your history unless we build key backup. Decision:

- **Phase 1:** text is encrypted in transit (TLS) and at rest (encrypted disk + encrypted DB backups), and the server is ours. The host could in theory read it. This is Signal-level for voice, Slack-level for text.
- **Phase 2 (planned, not optional):** end-to-end encrypt DMs and any channel flagged "private." The message table already allows the body to be an opaque encrypted blob; the client already renders "Encrypted message" for ciphertext-only bodies. What is missing is key exchange via per-user keypairs generated in the client.
- Do not use Matrix/Olm. Use the **MLS** standard (RFC 9420) via a maintained library when Phase 2 comes; it is what Discord itself adopted for voice and what the field is converging on.

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
| Media E2EE | LiveKit `ExternalE2EEKeyProvider`, per-channel key distributed by our app server over the authenticated WebSocket, rotated on member leave | Server forwards ciphertext only. Firefox has known cross-browser E2EE bugs (see sources): support Chromium-based browsers first, state it in the UI. |
| App server | Node 22, TypeScript, Fastify, `ws` for the socket, Drizzle ORM. **LiveKit tokens minted by hand with `node:crypto`**, no server SDK | Same language as the client. Thirty lines of JWT keeps a large dependency out of the process that holds our data. |
| Database | Postgres 16, native, provisioned by `bonesdeploy site services`, bound to localhost, data directory on the LUKS volume. **PGlite in development** (Postgres compiled to WebAssembly; zero installs on Windows, same SQL, same migrations) | Boring, correct, encrypted at rest without a managed-DB third party. |
| Files | **Local disk** under `DATA_DIR` on the encrypted volume (`STORAGE_DRIVER=local`). The S3 driver exists for MinIO later, only if disk cost bites | One fewer service to run and secure. For a friend group, the disk is the right size. |
| Auth | Our own. Argon2id passwords, TOTP 2FA, invite-only registration, sessions in httpOnly cookies, 15-minute LiveKit tokens | No identity provider gets a user list. |
| Client | React 19 + Vite, plain fetch + one store, `livekit-client` and `components-react` for M3 | Web first. Same code ships as a Tauri desktop app in Milestone 6. |
| Desktop | Tauri 2 | Small, Rust shell, global push-to-talk hotkey, window capture with audio on Windows. |
| Reverse proxy | **nginx**, provisioned by bonesdeploy; TLS via `bonesdeploy site ssl` | It is what the deploy tool provides. Caddy is out. |
| Deploy | **bonesdeploy** (section 2b) | Systemd + per-site Linux users + AppArmor + cgroups, no Docker daemon, GPG-encrypted secrets, versioned releases with rollback. Written by Alex, who is one message away. |
| Region | DigitalOcean **ATL1 (Atlanta)** | Wes is in Tennessee. Atlanta is the nearest region; expect 15–30 ms round trip from Chattanooga. NYC3 as fallback if ATL1 capacity is missing. |
| Box | Premium AMD 4 GB / 2 vCPU, plus a 50 GB block volume with LUKS | ~$33/mo. LiveKit is CPU-light for audio. |
| Repo | Private GitHub repo `MilkManManiac/GoOffline` | Private until Wes decides otherwise. |

**Explicitly banned:** Clerk, Auth0, Firebase, Supabase, Uploadthing, Sentry (hosted), PostHog (hosted), Google Fonts, any CDN-hosted JS, Cloudflare proxying (DNS-only is fine), Discord-clone tutorial code copied in, `@fastify/static` (dropped over a path-traversal advisory; nginx serves the built client). Every one of these is a third party in the data path.

## 2b. Deploying with bonesdeploy

Repo: https://github.com/AlextheYounga/bonesdeploy. Read its README and run `bonesdeploy skill` (embedded docs written for AI agents) before touching `infra/`.

What it gives us, and why it fits the threat model better than Docker did: each site is its own Linux user with its own systemd service, AppArmor profile and cgroup limits — the same kernel isolation Docker uses, without a root daemon, an image registry or a container runtime in the trust chain. Secrets live GPG-encrypted at `infra/secrets/.env.gpg` and are pushed to a mode-600 `shared/.env` on the box with `bonesdeploy secrets push`; the encrypted file *may* be committed, which means the session secret and LiveKit keys survive a dead laptop. Postgres is provisioned localhost-only with a per-site credential, reachable from a workstation only over an SSH tunnel. Releases are versioned; `bonesdeploy rollback` is one command.

How GoOffline maps onto it:

- `BONES_TEMPLATE=custom`. The shipped templates are Next/Nuxt/Vue/SvelteKit; we are a plain Fastify process plus a static Vite build. We write our own `deployment/build/` (npm ci, `vite build`, esbuild the server) and `deployment/prepare/` (run migrations) scripts. Expect an hour or two, not five minutes.
- The app server is one systemd unit: `node server/dist/index.js`, binding `127.0.0.1:8787`. nginx serves `web/dist` and proxies `/api` and `/gateway` to it.
- LiveKit and coturn are two more systemd units on the same box. They are Go binaries, not Node, so they may sit outside bonesdeploy's site model as plain units in `infra/custom/`. Decide when we get there; do not fight the tool.
- `bonesdeploy site services` provisions Postgres. `DATABASE_URL` goes into the encrypted secrets.
- LUKS is ours to do, before `bonesdeploy server setup`: attach the block volume, `cryptsetup`, mount at `/var/lib/gooffline` (uploads) and point Postgres's data directory at it. bonesdeploy does not know about disk encryption and should not need to.

**Open question for Alex, ask before M0:** does the generated nginx site config pass WebSocket upgrades (`Upgrade` / `Connection` headers, long `proxy_read_timeout`)? Our gateway is a WebSocket. If it does not, the app loads and then silently never updates. If the answer is no, it is four lines in a custom nginx snippet under `infra/custom/`, and we find out now rather than on launch night.

Honest note: it is a friend's tool under active development, and he says so — "sharp edges and perhaps some cool bugs." When it breaks, we are the bug report. That is a fair trade for a deploy path we can read end to end, and the author is a message away.

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
- Firewall (`ufw`): allow SSH, 80/443 (nginx), 7881/tcp + 50000–60000/udp (LiveKit), 3478 + 5349 (TURN). Deny everything else. Postgres and the app server listen on localhost only.
- `unattended-upgrades` on. Node, LiveKit and coturn versions pinned in the build scripts and updated deliberately, not ad hoc.
- LUKS on the block volume; DB data, uploads and backups live there. Key entered at boot via a script that fetches it from Wes's password manager, or accept that a reboot needs a human. Document which.
- Secrets: `infra/secrets/.env.gpg` in the repo (encrypted), `shared/.env` mode 600 on the box, nothing else. `infra/.env.example` documents every variable. `BONES_*` values never leave the workstation.
- LiveKit API key/secret rotated quarterly. User-facing LiveKit tokens live 15 minutes and name exactly one room.
- Rate limits on login, registration, message send, invite creation. (Done in M1.)
- Security headers: strict CSP (self only), HSTS, no referrer, no third-party origins at all. Set in nginx, checked with `curl -I` in the M0 handoff.
- Link previews (if ever built) are fetched by the server, never by the client, so members' IPs never leak to the linked site. Same for avatars and embeds.
- Logs: 14-day retention, no message bodies in logs, IPs hashed per boot (done in M1: `hashIp`).
- Backups: nightly `pg_dump` + uploads, encrypted **client-side** with `restic` before leaving the box, to a bucket at a *different* provider (Backblaze B2). B2 only ever sees ciphertext, which is why it is allowed. Restore test once a month, automated, with a pass/fail line in the admin panel.
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

Honest note: with media E2EE and encrypted disks, the *provider* is already mostly blind. The move off DO buys physical custody and gets away from a shared hypervisor. It does not buy much additional secrecy. Do it for control, not fear.

## 6. Milestones (each ends in something Wes can log into)

The rule from the collaboration manual: no milestone ends in a document. Ship the thing, screenshot it, ask him to poke it.

Order changed from the original brief: M1 and most of M2 were built locally first because they cost nothing and nothing was blocked on a box. M0 is next, the moment there is a box.

**M0 — Infra weekend. NEXT.** Droplet in ATL1, domain, LUKS volume, `bonesdeploy server setup` and `site setup` with the custom template, Postgres, nginx with TLS, LiveKit, coturn, the full section-4 checklist, restic backups to B2. Deploy the *real* app — not the LiveKit sample — since it already exists. *Done when: Wes and one friend sign in at the real domain over HTTPS, chat across two channels from two houses, and `curl -I` shows the security headers. Voice can still be empty.*

**M1 — Text skeleton. DONE (local).** Invite-only registration with TOTP, servers, categories, text channels, real-time messages, edit/delete, uploads, typing, presence. *Done when: Wes and one friend chat across two channels.* Met locally; the real-domain version is M0's exit criterion.

**M2 — Roles and permissions. Server DONE, UI not started.** Discord's model, faithfully: role bitmasks, `@everyone`, channel overrides with deny-beats-allow, admin bypass, owner bypass, server-side only, 404-not-403 for hidden channels. Remaining: settings UI for roles and per-channel overrides, and the audit log. *Done when: a channel exists that a friend can read but not post in, and the audit log shows who set it.*

**M3 — Voice channels with E2EE.** Join/leave, mute, deafen, speaking rings, who's-here sidebar, per-channel E2EE key distributed over the socket and rotated on leave (scaffolding done). Connection panel wired to real stats. Join/leave sounds. *Done when: the D&D group runs a full session on it and nobody asks to go back to Discord that night.*

**M4 — Video and screen share.** Camera tiles, share screen or one window, simulcast, viewer chooses focus, E2EE covers video too. *Done when: someone shares a map and someone else shares a game, both at once.*

**M5 — Feel.** Unread badges, mentions, reactions, replies, link handling, keyboard shortcuts, sounds. Read `references/ai-tell.md` in the milk-project skill before this one. *Done when: Wes says it doesn't feel like a clone.*

**M6 — Desktop app.** Tauri 2, global push-to-talk, share a game window with its audio, start with Windows, tray icon. *Done when: Wes plays a game with PTT and never alt-tabs.*

**M7 — Text E2EE (Phase 2 from section 1).** DMs and private channels via MLS. Key backup. *Done when: the server owner runs a DB query and cannot read a private channel.*

**M8 — The unglamorous 30%.** Moderation tools, password reset without email (recovery codes), data export, monthly restore test, mobile PWA polish.

Time honesty: M0–M4 are the fun part. M5 and M8 together are as long as M0–M4 combined. That is where this kind of project dies. See `references/the-wall.md`.

## 7. Repo layout

```
GoOffline/
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
  desktop/             Tauri 2 (M6)
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

## Sources

- bonesdeploy: https://github.com/AlextheYounga/bonesdeploy
- DO Atlanta region: https://www.digitalocean.com/blog/introducing-new-atlanta-data-center , https://docs.digitalocean.com/platform/regional-availability/
- LiveKit E2EE: https://docs.livekit.io/transport/encryption/ , https://livekit.com/security/overview
- LiveKit E2EE Firefox/Chromium interop bug (Sept 2026): https://github.com/livekit/client-sdk-js/issues/2103
- LiveKit self-hosting: https://fazliev.com/blog/livekit-production-guide
- Stoat and Fluxer (both LiveKit-based): https://en.wikipedia.org/wiki/Stoat_(software) , https://fluxer.app/
- SFU comparison: https://bloggeek.me/webrtc-tools/media-servers-oss/
- DO pricing: https://www.digitalocean.com/pricing/droplets
