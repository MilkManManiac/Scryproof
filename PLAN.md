# GoOffline — your own Discord. Research + plan (2026-09-16)

## The one-paragraph version

Everything in Discord except the voice/video engine is normal web-app work: accounts, servers, channels, roles, messages, invites. That part we build ourselves. The voice/video/screen-share engine is the one piece nobody sane writes from scratch. For that we run **LiveKit**, an open-source media server, on our own DigitalOcean box. It is what the two best open-source Discord clones (Stoat and Fluxer) already use under the hood. Total run cost is about $30 to $40 a month for a friends-and-D&D-group sized server.

## What already exists (so we know what "our own" means)

| Project | What it is | Voice | Video / screen share | Verdict |
|---|---|---|---|---|
| **Stoat** (was Revolt) | Closest Discord look-alike, self-hostable, Rust backend | Yes, via LiveKit | Yes since late 2025 | Best "install it this weekend" option |
| **Fluxer** | Newer Discord-like, Node + Postgres, AGPL | Yes, via LiveKit | Yes, incl. noise suppression | Also solid; v2 added easier self-host and mobile |
| **Spacebar** | Reimplements Discord's actual API so Discord bots/clients work | Partial / unfinished | Partial | Clever but voice is the weak spot |
| **Element / Matrix** | Federated, encrypted, more Slack than Discord | Yes | Yes | Heavier, feels like a work tool |
| **Mumble / TeamSpeak** | Voice only | Excellent | No | Not a Discord |

Takeaway: the "servers + channels + roles" shape is well-trodden. The voice stack has converged on LiveKit. Nobody has nailed the *feel*, which is where a custom build can actually win.

## Two ways to do this. Pick one.

**Path A — Build our own on top of LiveKit.** (Recommended, and it is what you asked for.)
We own the client and the text/permissions backend. LiveKit does media. You get to shape every screen. This is a real project: a couple of months of evenings to reach "my friends use it instead of Discord."

**Path B — Self-host Stoat or Fluxer, then customize.**
Running in a day. You'd be theming and tweaking someone else's app, and every deep change fights their codebase. Good as a *reference* to poke at, bad as the thing you call yours.

My call: do A, but stand up Fluxer on the same droplet for one evening first as a playable reference. You generate ideas by touching the thing. It also proves the droplet, DNS, and LiveKit ports work before we write any code.

## Architecture (plain English)

```
Your browser / desktop app
   |                     \
   |  text, presence      \  voice, video, screen
   v                       v
 App server (Node)      LiveKit (media server)
   |                       |
 Postgres               coturn (relay for strict home routers)
```

- **App server**: Node/TypeScript. Handles login, servers, channels, roles, messages, invites, DMs. Talks to the browser over a WebSocket so messages and "who's online" update instantly. Hands out short-lived tokens that let a user join a LiveKit room.
- **Postgres**: the database. One table each for users, servers, members, roles, channels, messages, attachments, invites.
- **LiveKit**: one Go binary. Each voice channel is a LiveKit "room." It receives each person's audio/video once and forwards it to everyone else (this is called an SFU). Screen share is just another video track. Handles 100+ people in a room on a small box.
- **coturn**: a relay for people whose router blocks direct connections (about 1 in 4 home networks). Without it, some friends will "just not connect" and you'll never know why.
- **Object storage** (DO Spaces, $5/mo): images, files, avatars. Keeps the droplet disk clean.
- **Caddy**: the front door. Gets HTTPS certificates automatically. Required, because browsers refuse to give mic/camera access to non-HTTPS sites.

**Client**: a web app first (React). Same code becomes a desktop app later via Tauri, which is what you need for a global push-to-talk hotkey and for sharing a game window with its audio. Phones use the web app installed as a PWA until that matters.

## Permissions model (this is where Discord clones cut corners)

Copy Discord's actual model, because it is good:
- A server has **roles**, each a bitmask of permissions (send messages, manage channels, connect to voice, speak, share screen, kick, ban, manage roles, etc.).
- Every member has `@everyone` plus any assigned roles. Permissions add up.
- **Channel overrides**: any channel can allow/deny a specific permission for a specific role or member. Deny beats allow. That's how you get a mod-only channel or a muted user.
- Admin bit bypasses everything. Server owner bypasses admin.

Compute the effective permission set once per request on the server, never in the browser. Clones that skip channel overrides feel wrong within a week.

## DigitalOcean sizing and cost

| Item | Spec | Monthly |
|---|---|---|
| Droplet | Premium AMD, 2 vCPU / 4 GB, NVMe | ~$28 |
| Spaces (file storage) | 250 GB + CDN | $5 |
| Managed Postgres | optional; run it on the droplet at first | $0 (later $15) |
| Domain | yearly | ~$12/yr |
| **Total** | | **~$33/mo** |

Bandwidth: the droplet includes 4 TB out. Rough numbers so you can sanity-check:

| Scenario | Outbound rate | Per hour |
|---|---|---|
| 10 people in voice | ~6 Mbps | ~2.7 GB |
| 1 screen share to 5 viewers | ~10 Mbps | ~4.5 GB |
| 5 people, everyone on camera | ~25 Mbps | ~11 GB |

Even 80 hours a month of screen-shared D&D stays under 400 GB. Overage is $0.01/GB, so a blown estimate costs dollars, not hundreds.

Start on one box. LiveKit only needs a second box (plus Redis) past a few hundred simultaneous voice users, which is not a problem you have.

## Build order

Each step ends with something you can log into and poke at. No step ends in a doc.

0. **Infra weekend.** Droplet, domain, Caddy, LiveKit + coturn in Docker, firewall ports open (443, 7881/tcp, 50000–60000/udp, 3478 for TURN). Run Fluxer for one evening as the reference. Deliverable: a URL where two people can hear each other.
1. **Text skeleton.** Login, create a server, channels, send messages in real time, invites. Deliverable: you and one friend chatting.
2. **Roles + permissions.** Full model above, with the settings UI. Deliverable: a channel your friend can read but not post in.
3. **Voice channels.** Join/leave, mute, deafen, speaking indicator, who's-in-the-channel sidebar. Deliverable: the D&D group runs a session on it.
4. **Video + screen share.** Camera tiles, share a screen or a single window, viewer picks who to watch. Deliverable: someone shares a map or a game.
5. **Feel pass.** Sounds on join/leave, notification badges, typing indicators, message editing, reactions, image previews. This is the step that decides if people stay.
6. **Desktop app.** Tauri wrapper, global push-to-talk, share game window with audio, start-with-Windows.
7. **The 30% nobody plans for.** Backups, moderation tools (ban, slowmode, delete-by-user), email for password reset, mobile PWA polish.

## Risks, honestly

- **NAT and firewalls.** The single most common "voice doesn't work" cause. coturn from day one, and a "connection quality" indicator in the UI so you can see it instead of guessing.
- **Echo, noise suppression, auto-gain.** Browsers do a decent job; Discord does a great one. Krisp-level noise removal is a paid add-on. Expect it to sound like a good Google Meet, not like Discord, at first.
- **Mobile.** Background voice on iPhone in a PWA is unreliable. Real mobile apps are a separate later project.
- **Step 5 is where it dies.** Steps 0–4 are fun; step 5 is a hundred small things. Plan for it to take as long as 1–4 combined.

## Open decisions (I'll default these unless you say otherwise)

- Name and domain. Working title is the folder name, GoOffline.
- Web-only for launch, desktop app after. Default: yes.
- Who is it for: a private server for your groups, or something others can spin up too? Default: private first, which lets us skip signups/abuse handling for months.
- Fluxer-for-an-evening as reference: default yes.

## Sources

- Self-hosted Discord alternatives: https://digitalbiztalk.com/article/self-hosted-discord-alternatives-complete-2026-comparison-guide , https://zap-hosting.com/en/blog/2026/02/the-best-self-hosted-discord-alternatives-2026-ranking-pros-cons/
- Stoat (ex-Revolt), LiveKit-backed voice + screen share: https://en.wikipedia.org/wiki/Stoat_(software) , https://github.com/javif89/stoat-selfhost
- Fluxer: https://fluxer.app/ , https://fluxer.app/blog/mobile-clients-and-fluxer-v2
- Spacebar: https://github.com/spacebarchat/spacebarchat , https://docs.spacebar.chat/faq/
- SFU comparison (LiveKit vs mediasoup vs Jitsi): https://bloggeek.me/webrtc-tools/media-servers-oss/ , https://trembit.com/blog/livekit-vs-mediasoup/
- LiveKit self-hosting and ports: https://fazliev.com/blog/livekit-production-guide , https://celloip.com/blog/self-hosted-livekit-deployment-guide/
- DigitalOcean pricing: https://www.digitalocean.com/pricing/droplets , https://infratally.com/articles/digitalocean-droplet-pricing-guide-2026/
- Example Next.js + LiveKit clones (for reference, not to copy): https://github.com/topics/discord-clone?o=desc&s=updated
