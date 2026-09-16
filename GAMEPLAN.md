# GoOffline — Game plan and build brief

Written 2026-09-16 for handoff to the build session. Background research is in `PLAN.md`; this file is the authority when they disagree.

Wes's three priorities, in his words: **it's ours, our data is secure, and latency.** Everything below is ordered by those.

---

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
- **Phase 2 (planned, not optional):** end-to-end encrypt DMs and any channel flagged "private." Design the message table from day one so the body can be an opaque encrypted blob and the server never needs to parse it. That means: no server-side search on encrypted channels, and key exchange via per-user keypairs generated in the client.
- Do not use Matrix/Olm. Use the **MLS** standard (RFC 9420) via a maintained library when Phase 2 comes; it is what Discord itself adopted for voice and what the field is converging on.

## 2. Architecture (final)

```
           Wes's friends (browser now, desktop app later)
                 |                          |
        HTTPS + WebSocket                UDP (SRTP, E2EE)
                 |                          |
   +-------------v----------+     +---------v----------+
   |  Caddy (TLS, reverse   |     |  LiveKit SFU       |
   |  proxy, auto certs)    |     |  (voice/video/     |
   +-------------+----------+     |   screen share)    |
                 |                +---------+----------+
   +-------------v----------+               |
   |  App server            |     +---------v----------+
   |  Node 22 + TypeScript  |     |  coturn (TURN relay|
   |  Fastify + ws          |     |  fallback only)    |
   +-------------+----------+     +--------------------+
                 |
   +-------------v----------+     +--------------------+
   |  Postgres 16           |     |  MinIO (S3-compat  |
   |  (on LUKS-encrypted    |     |  files, on the same|
   |   volume)              |     |  encrypted volume) |
   +------------------------+     +--------------------+
```

All of it in one `docker-compose.yml` on one box. Nothing leaves the box except to the users.

**Locked decisions** (the build session does not relitigate these):

| Concern | Choice | Why |
|---|---|---|
| Media server | LiveKit, self-hosted, Apache-2.0 | Only open SFU with production E2EE, first-party web + desktop SDKs, single Go binary. Stoat and Fluxer both chose it. |
| Media E2EE | LiveKit `ExternalE2EEKeyProvider`, per-channel key distributed by our app server over the authenticated WebSocket, rotated on member leave | Server forwards ciphertext only. Firefox has known cross-browser E2EE bugs (see sources): support Chromium-based browsers first, state it in the UI. |
| App server | Node 22, TypeScript, Fastify, `ws` for the socket, Drizzle ORM | Same language as the client, LiveKit's server SDK is first-class in Node. |
| Database | Postgres 16 in Docker on a LUKS-encrypted DO volume | Boring, correct, encrypted at rest without a managed-DB third party. |
| Files | MinIO in Docker, same encrypted volume | Self-hosted S3. Keeps attachments off DO Spaces. Swap to Spaces later only if disk cost bites. |
| Auth | Our own. Argon2id passwords, TOTP 2FA, invite-only registration, sessions in httpOnly cookies, 15-minute LiveKit tokens | No identity provider gets a user list. |
| Client | React 19 + Vite, TanStack Query, LiveKit `components-react` | Web first. Same code ships as a Tauri desktop app in Milestone 6. |
| Desktop | Tauri 2 | Small, Rust shell, global push-to-talk hotkey, window capture with audio on Windows. |
| Reverse proxy | Caddy | Automatic TLS, HTTP/3, two-line config. |
| Region | DigitalOcean **ATL1 (Atlanta)** | Wes is in Tennessee. Atlanta is the nearest region; expect 15–30 ms round trip from Chattanooga. NYC3 as fallback if ATL1 capacity is missing. |
| Box | Premium AMD 4 GB / 2 vCPU, plus a 50 GB block volume with LUKS | ~$33/mo. LiveKit is CPU-light for audio. |
| Repo | Private GitHub repo `MilkManManiac/GoOffline` | Private until Wes decides otherwise. |

**Explicitly banned:** Clerk, Auth0, Firebase, Supabase, Uploadthing, Sentry (hosted), PostHog (hosted), Google Fonts, any CDN-hosted JS, Cloudflare proxying (DNS-only is fine), Discord-clone tutorial code copied in. Every one of these is a third party in the data path.

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

Build a **connection panel** into the voice UI in Milestone 3: RTT, jitter, packet loss, codec, whether TURN is in use. Wes can't diagnose from a guess, and neither can the build session. Instruments, not theories.

## 4. Security checklist for the box (do all of it in Milestone 0)

- SSH: key-only, root login off, non-standard port, `fail2ban`.
- Firewall (`ufw`): allow 22 (SSH), 80/443 (Caddy), 7881/tcp + 50000–60000/udp (LiveKit), 3478 + 5349 (TURN). Deny everything else. Postgres and MinIO are reachable only inside the Docker network.
- `unattended-upgrades` on. Docker images pinned by digest and updated on a schedule, not ad hoc.
- LUKS on the block volume; DB, MinIO, and backups live there. Key entered at boot via a script that fetches it from Wes's password manager, or accept that a reboot needs a human. Document which.
- Secrets in a `.env` on the box, mode 600, never in git. Repo holds `.env.example` only.
- LiveKit API key/secret rotated quarterly. User-facing LiveKit tokens live 15 minutes and name exactly one room.
- Rate limits on login, registration, message send, invite creation.
- Security headers: strict CSP (self only), HSTS, no referrer, no third-party origins at all.
- Link previews (if ever built) are fetched by the server, never by the client, so members' IPs never leak to the linked site. Same for avatars and embeds.
- Logs: 14-day retention, no message bodies in logs, IPs hashed after 24 hours.
- Backups: nightly `pg_dump` + MinIO sync, encrypted **client-side** with `restic` before leaving the box, to a bucket at a *different* provider (Backblaze B2). Restore test once a month, automated, with a pass/fail line in the admin panel.
- Audit log table: every permission change, ban, kick, channel delete, with actor and timestamp. Visible to server owner.
- Data export: any user can download everything they've posted as JSON. The server owner can export the whole server. "Ours" means we can leave.

## 5. Hosting path (start on DO, keep the exits open)

Wes said he may leave DigitalOcean later. Design for it now so it's a weekend, not a rewrite:

- Everything runs from one `docker-compose.yml` and one encrypted volume. Moving hosts is: new box, restore backup, change DNS.
- No DO-specific services. No Spaces, no managed DB, no DO load balancer, no DO firewall rules that aren't also in `ufw`.

Where to go when the time comes, ranked:

| Option | Privacy | Latency for the group | Cost | Verdict |
|---|---|---|---|---|
| **Hetzner or OVH bare-metal, US East (Ashburn)** | Full disk yours, no shared hypervisor, still a provider | 20–35 ms from TN | $40–80/mo dedicated | **Recommended next step.** Real hardware, same compose file. |
| Home server behind a VPS "front door" | Physical control of the data | Worse: media bounces through the relay, and residential upload caps it | Hardware + a $6 VPS | Only if physical custody matters more than latency. Fronting VPS sees encrypted packets only. |
| Home server, direct | Full physical control | Depends entirely on Wes's upload and ISP; exposes home IP to every member | Hardware + electricity | **Not recommended.** Voice quality and uptime suffer, and the IP exposure is a bigger privacy hole than DO. |
| Colocation (1U in a Chattanooga/Atlanta DC) | Physical control, DC-grade network | Best possible | $50–100/mo + hardware | The endgame if this becomes something. |

Honest note: with media E2EE and encrypted disks, the *provider* is already mostly blind. The move off DO buys physical custody and gets away from a shared hypervisor. It does not buy much additional secrecy. Do it for control, not fear.

## 6. Milestones (each ends in something Wes can log into)

The rule from the collaboration manual: no milestone ends in a document. Ship the thing, screenshot it, ask him to poke it.

**M0 — Infra weekend.** Droplet in ATL1, domain, Caddy, LiveKit, coturn, Postgres, MinIO, LUKS volume, full section-4 checklist, restic backups to B2. Run the LiveKit sample app so two people can hear each other. *Done when: Wes and one friend talk for 5 minutes and the connection panel shows RTT and no TURN.*

**M1 — Text skeleton.** Invite-only registration with TOTP, servers, categories, text channels, real-time messages, edit/delete, images via MinIO. *Done when: Wes and one friend chat across two channels.*

**M2 — Roles and permissions.** Discord's model, faithfully: role bitmasks, `@everyone`, channel overrides with deny-beats-allow, admin bypass, owner bypass. Server-side computation only. Settings UI for roles and per-channel overrides. Audit log. *Done when: a channel exists that a friend can read but not post in, and the audit log shows who set it.*

**M3 — Voice channels with E2EE.** Join/leave, mute, deafen, speaking rings, who's-here sidebar, per-channel E2EE key distributed over the socket and rotated on leave. Connection panel. Join/leave sounds. *Done when: the D&D group runs a full session on it and nobody asks to go back to Discord that night.*

**M4 — Video and screen share.** Camera tiles, share screen or one window, simulcast, viewer chooses focus, E2EE covers video too. *Done when: someone shares a map and someone else shares a game, both at once.*

**M5 — Feel.** Typing indicators, unread badges, mentions, reactions, replies, link handling, keyboard shortcuts, sounds. Read `references/ai-tell.md` in the milk-project skill before this one. *Done when: Wes says it doesn't feel like a clone.*

**M6 — Desktop app.** Tauri 2, global push-to-talk, share a game window with its audio, start with Windows, tray icon. *Done when: Wes plays a game with PTT and never alt-tabs.*

**M7 — Text E2EE (Phase 2 from section 1).** DMs and private channels via MLS. Key backup. *Done when: the server owner runs a DB query and cannot read a private channel.*

**M8 — The unglamorous 30%.** Moderation tools, password reset without email (recovery codes), data export, monthly restore test, mobile PWA polish.

Time honesty: M0–M4 are the fun part. M5 and M8 together are as long as M0–M4 combined. That is where this kind of project dies. See `references/the-wall.md`.

## 7. Repo layout for the build session

```
GoOffline/
  CLAUDE.md            project rules (non-negotiables from this file)
  GAMEPLAN.md          this file
  PLAN.md              background research
  infra/
    docker-compose.yml
    Caddyfile
    livekit.yaml
    coturn.conf
    setup-box.sh       everything in section 4, idempotent
    backup.sh          restic to B2
  server/              Fastify + ws + Drizzle
  web/                 React + Vite + LiveKit components
  desktop/             Tauri 2 (M6)
  docs/
    HANDOFF.md         living state for the next session
    permissions.md     the bitmask table, kept in sync with code
```

## 8. Non-negotiables (copy these into CLAUDE.md)

1. No third-party service in the data path. If a library phones home, it doesn't ship.
2. Media is end-to-end encrypted from M3 onward. Never "temporarily" disabled.
3. Permissions are computed on the server. The client only hides buttons.
4. Every milestone ends with a URL Wes can open and a screenshot in the handoff doc.
5. One box, one compose file, one encrypted volume. Portable by construction.
6. No Discord-clone tutorial code. Write it, understand it, own it.
7. Every voice UI has the connection panel. Diagnose with instruments.

## Sources

- DO Atlanta region: https://www.digitalocean.com/blog/introducing-new-atlanta-data-center , https://docs.digitalocean.com/platform/regional-availability/
- LiveKit E2EE: https://docs.livekit.io/transport/encryption/ , https://livekit.com/security/overview
- LiveKit E2EE Firefox/Chromium interop bug (Sept 2026): https://github.com/livekit/client-sdk-js/issues/2103
- LiveKit self-hosting: https://fazliev.com/blog/livekit-production-guide
- Stoat and Fluxer (both LiveKit-based): https://en.wikipedia.org/wiki/Stoat_(software) , https://fluxer.app/
- SFU comparison: https://bloggeek.me/webrtc-tools/media-servers-oss/
- DO pricing: https://www.digitalocean.com/pricing/droplets
