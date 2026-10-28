# Scry: the vision

Written 2026-10-28 by Wes with Fable, for Trey and anyone who builds on Scry. **Draft 2.** Status: pick 1 answered 2026-10-28 (both doors, paid hosting as soon as it can be real). Picks 2 to 9 in section 9 are open, to be settled on the Wes and Trey call this afternoon; the lettered recommendations there are Fable's, and Wes has said he is "open on some of these things," so nothing in section 9 is decided until he says so. Pushed to main 2026-10-28 on Wes's word so Trey can read it before the call. When the picks are in, this file is the authority on *what* Scry is and *who it is for*; `GAMEPLAN.md` stays the authority on *how it is built*; `CLAUDE.md` holds the rules nobody breaks.

Trey's ask, 2026-10-28: "put fable on xhigh reasoning and you dictate to it your full unadulterated vision in minute detail and y'all discuss it. Have fable write it up and push it up so I can build exactly what you want." And: "I need that vision doc ASAP, everything, all the detail, every damned thought or idea you've ever had relating to scry." This is that document.

---

## Read this first

Scry is the Discord we built for ourselves: servers, channels, roles, DMs, voice, video, screen share with one app's sound, games, a soundboard, a Windows app, a Mac app, a phone web client. All of it end-to-end encrypted, on one small box Wes pays for, at scryproof.com. It has been live since 2026-09-21 and we use it.

On 2026-10-27 Discord announced that messages in public servers will start showing up in Google. Trey wants to use that moment. Wes, the same day: **"i think we have a real opportunity to make a product for more folks than just friends."**

The one line: **Scry is a Discord your group owns. Encrypted, on one box, nothing to index.**

Who it is for: groups of people who already know each other. Three to fifty. A D&D table, a gaming crew, a podcast, a family, a small studio. Not thousand-member communities; those are what Discord is for, and they are what the news is about.

The shape of the product, Wes's pick on 2026-10-28: **"C with paid hosting now or ASAP. So if they can do it on their own, if they want to set up their own server, or if they want to pay us, they can do that."** Two doors into the same thing. **Run your own:** an installer that gives a group its own Scry on a box they pay for, in one evening. **Let us host it:** the same install on a dedicated box per group, set up by our script, billed monthly through Stripe (Matt: "stripe billing with dedicated VPS hosting"). scryproof.com stays ours, friends and approved servers only, plus a guest door so a stranger can try it before choosing either.

The clock, honestly: Discord's change only touches "Discoverable Servers" (1,000+ members, eight weeks old, opted into Discord's public directory). Server web pages with AI summaries land **2026-11-16**. Individual messages reach Google in **mid-December 2026**. Each date is a news wave. The target is to have the pitch, the demo door and the install path true before November 16, and the paid door open as soon after as billing is real. The 48 hours is Trey's energy, not the market's deadline, and that energy is worth using.

---

## 1. Why Scry exists

Wes's three priorities, in his words, from `GAMEPLAN.md`: **"it's ours, our data is secure, and latency."** Everything in this document is ordered by those.

What "ours" means, in his words and the project's:

- "as secure and private as possible, knowing we don't control DigitalOcean." (2026-09-17)
- "doesn't have to be the easiest way it has to be the right way" (2026-09-24, on anything that touches the app)
- "nothing goes in and out that shouldn't be" (2026-09-24)
- "I trust my friends and I trust the people that I give access / collaborator / contributor status to. But I want to have processes in place to not only explain what they're doing but to also check and make sure they didn't screw up, or if someone hacked them and tried to screw something up." (2026-09-25)
- `GAMEPLAN.md`: "'Ours' means we can leave." Any user can export everything they posted. The whole server restores onto a new box with a DNS change.
- Moving hosts is a weekend, not a rewrite. Colocation is "the endgame if this becomes something."

Scry was never a privacy lecture. It was built because Wes wanted a place for his people that is theirs, with voice that sounds good, screen share that works for game night, and things to do in it. Fun is the north star across every one of his projects; security is the floor, not the point. A product pitch that forgets this will read like every other privacy app.

## 2. What Scry is today

So nobody rebuilds what exists. Live at scryproof.com as of 2026-10-27:

- **Servers, categories, text channels.** Roles with per-channel permissions, computed on the server. Audit log. Invite-only sign-up with TOTP two-factor. Password reset. Sign out everywhere.
- **DMs and group DMs.** Per-channel text end-to-end encryption (M7, stages 1 to 3 live since 2026-09-23).
- **Voice, camera, screen share**, end-to-end encrypted through LiveKit. Share one app's sound on Windows; share sound on Mac as of 0.5.10 (Trey, Core Audio taps). Pop a stream out. Comments on a stream. Stream quality choice. Connection panel (RTT, jitter, loss, TURN) in every voice UI.
- **Things to do:** Activities (Hero Line, Queens, Drain The Swamp, Purdle, pass-along song, Trundle), polls, dice, song requests, a call mixer with listener meters, YouTube cards that play in the app, about 100 sounds and a soundboard.
- **Apps:** Windows desktop app with signed self-updates, push-to-talk and a tray icon (Wes signs and publishes). Mac app 0.5.10, notarized (Trey). Phone-friendly web client (no push notifications yet). Matt owns Linux.
- **Hosting for others, first step:** anyone on scryproof.com can press + and "ask for a server"; Wes approves. A $ at the top of every server opens Wes's Venmo tip jar. Wes's words: "open up the availability for other people to make servers but... I hit a button that approves it just so they don't go crazy with it" and "add my Venmo me / tip thing at the top of basically every server."
- **The box:** one DigitalOcean droplet, LUKS-encrypted volume, deployed with bonesdeploy (systemd + nginx, no Docker). Boots locked; Wes unlocks. Backups via restic. HANDOFF records it as 1 GB / 1 vCPU at $6 a month with about 500 MB in use at rest; GAMEPLAN planned 2 GB in ATL1. A builder confirms which before any capacity work.
- **The agent channel** (Trey's epic, spec'd in `docs/agent-channel-spec.md`, not started): one channel where members' AI coding agents join as named participants. A conscious, labelled exception to the privacy posture: the box can read that channel.

The largest call on record is a handful of people. The TURN path has not been exercised in a real call. Nobody has load-tested anything. These are facts, not criticisms, and section 8 deals with them.

## 3. What the news changes, and what it does not

What Discord announced on 2026-10-27:

- Only **Discoverable Servers** are affected: 1,000+ members, at least eight weeks old, opted into Discord's public directory, meeting activity and safety rules.
- From **November 16**: every Discoverable Server gets a Server Web Page, with AI-generated summaries of public channel discussions.
- From **mid-December**: individual messages from eligible public channels appear on those pages and in Google and other search engines. No usernames or avatars; older messages excluded.
- Opt-out exists per user (Data and Privacy, Channel Messages) and per server (Server Settings, Web Presence). Default is on.
- Private servers, DMs and group DMs are **not** included.

What it does not change: almost nobody we know is in an affected server as a poster who cares. Our own Discord servers are private. The honest version of the pitch is not "your messages are about to be on Google." It is:

> Discord decided, on its own, what happens to what you wrote. It will decide again. Scry is the Discord your group owns, so nobody decides for you. Not Discord, not a host, not us.

That holds on November 16, in December, and the next time any platform changes its mind. It does not expire with the news cycle.

## 4. The pitch

**One line.** Scry is a Discord your group owns. Encrypted, on one box, nothing to index.

**For whom.** Groups who already know each other. A D&D table, a raid group, a podcast, a family, a small studio, a crew of friends who have been on the same Discord server for eight years. Three to fifty people. If you need a public directory, AutoMod, stage channels, Nitro or a shop, you need Discord, and that is fine.

**Three things that are true here and not there.**

1. **Nobody can read it, including the people who run it.** Text, voice, camera and screen share are end-to-end encrypted. No key that decrypts members' content ever exists on the server. The UI says "encrypted" only where that is true, and says plainly where it is not (the agent channel).
2. **It is yours.** One box, one encrypted volume, one deploy tool, and the whole thing restores onto a new box with a DNS change. Export everything you posted as JSON. Leave whenever you want and take it with you. Hosted by us or run by you, and one restore moves you between the two. No third-party service in the data path: no analytics, no error tracker, no auth provider, no CDN, no font server. Nothing phones home.
3. **It is still fun.** Voice that sounds good, screen share with the game's sound, a soundboard, dice, polls, games you play in the call, song requests, a mixer so one friend is not three times louder than the rest. Scry is not a privacy product with chat bolted on. It is the place you hang out, and it happens to be yours.

**And one thing nobody else has.** A channel where your coding agent sits at the table with everyone else's. Trey's spec; Trey's audience; nobody else's rules about what an agent may post. This is the "ours" priority made visible, and for the people Trey reaches it may be the bigger draw than privacy. Both stories go out together.

**What Scry refuses to do, by design.** From Wes's own sort of Discord's features (`docs/discord-features.md`, "Skip"): no server discovery, no public directory, no server templates or onboarding funnels, no bot and app store, no Nitro, no boosts, no shop, no quests, no stickers, no AutoMod, no stage or forum channels, no in-game overlay. There is nothing to index because there is no directory. That is the product.

**Tone of anything public.** Wes's standards apply (the `ai-tell` gate in the Milk Project): no generic AI landing page, no decorative icon sets or emoji, no photoreal generated people, no stock privacy clichés (padlocks, hooded figures, "military-grade"). Real screenshots of real servers with real game nights. Short plain sentences. It should look like a thing friends made because they wanted it, which is what it is.

## 5. The product beyond friends

Wes's pick, 2026-10-28: **"C with paid hosting now or ASAP. So if they can do it on their own, if they want to set up their own server, or if they want to pay us, they can do that."** Matt, the same day: "stripe billing with dedicated VPS hosting." Trey: "Sure, idgaf if I make no money off it and you do tbh I'm just having fun building w/ friends. Lets do it."

Two doors into the same product, one installer behind both. Not scryproof.com with more people on it: one box per group, every time.

**Door 1, run your own.** A group gets a box (DigitalOcean, Hetzner, anything with Ubuntu), a domain, runs the Scry installer, and in one evening has their own Scry with the same Windows, Mac and web apps pointed at it. They pay their host, not us. Nothing of theirs ever touches our box. Every rule in section 6 holds with no exception. Needs: the installer (phase 5), multi-home clients (phase 4), and the installer and app releases public (section 9, pick 2).

**Door 2, let us host it.** The same installer, run by our script on a dedicated box per group, one box per customer, never shared. They get a subdomain or their own domain, a monthly bill through Stripe, and a box they never touch. We keep the difference between the box and the price. Needs: billing (Stripe Checkout on Stripe's own hosted page, a webhook into a small billing service on our side; Stripe never gets a script tag inside the app and never sees a message), provisioning (the host's API creates the box, our script installs, DNS points), a hosted-unlock story (below), a status page, and a support path that is not Wes's DMs.

**What hosted boxes can and cannot promise.** Rule 8 holds completely: no key that decrypts a hosted group's text, voice, video or screen share ever exists on their box or ours, so we cannot read it even though we run the machine. Rule 9 (the box boots dumb, the passphrase never on the box) is where hosting has to be honest: a box we run reboots when the host reboots it, and somebody has to unlock the volume. Two options, pick 6: the customer's owner holds the passphrase and unlocks from a page after a reboot (what Wes does today), or we hold it in a separate secrets store and the UI says so. Either way the server header tells the truth in one line: "Hosted by Scry. We keep the box running. We cannot read your messages or calls."

**Moving between the doors.** A hosted group can take a restore and leave for their own box; a self-hosted group can hand us a restore and stop running it. Same restore, same DNS change. That is "ours means we can leave" applied to us too, and it belongs in the pitch.

**scryproof.com** stays ours: friends, approved servers for people Wes knows, and the guest door (phase 3) so a stranger can sit in a call before picking a door.

**Money, plainly.** Wes does every money setup himself: the Stripe account, the bank, the business entity, taxes. Trey has said he does not need a cut; that is between Wes and Trey and is written here only so nobody is surprised later. Price shape is pick 3; the number is Wes's.

## 6. Rules that do not move

Copied from `CLAUDE.md` so a builder never has to go looking. Any build that breaks one is wrong even if it works.

1. No third-party service in the data path. No Clerk, Auth0, Supabase, Firebase, Sentry, PostHog, Uploadthing, Google Fonts, CDN scripts, Cloudflare proxy. If a library phones home, it does not ship.
2. Voice, video and screen share are end-to-end encrypted (LiveKit E2EE). Never "temporarily" disabled.
3. Permissions are computed on the server. The client only hides buttons.
4. Every milestone ends with a URL Wes can open and a screenshot in `docs/HANDOFF.md`. No milestone ends in a document.
5. One box, one deploy tool (bonesdeploy: systemd + nginx, no Docker), one LUKS-encrypted volume. Movable to another host by restore + DNS change.
6. No Discord-clone tutorial code. Write it, understand it, own it.
7. Every voice UI shows the connection panel (RTT, jitter, loss, TURN yes/no). Diagnose with instruments, not guesses.
8. No key that decrypts members' content ever exists on the server. Not generated there, not relayed in the clear, not backed up there. The UI says "encrypted" only where that is true.
9. The box boots dumb: nothing secret on the unencrypted root disk, the volume passphrase never on the box, a reboot stays locked until the owner unlocks it.

Added for the product phase:

10. **Every rule above applies to every box, not just ours.** The installer may not take a shortcut that scryproof.com would refuse. If an install is too hard without breaking a rule, the answer is a better installer, not a weaker rule.
11. **Nothing goes live, public or out without Wes's explicit yes for that specific thing.** Deploys to scryproof.com, making the repo public, posting a release, any announcement under the Scry name. "Yes work on it" is not "yes ship it." Trey's builders open PRs; Wes merges and deploys.
12. **Wes keeps the signing keys** (Windows client signing, the box's SSH key, the LUKS passphrase). Trey keeps the Apple notarization identity. Neither is ever in a repo, a spec, an agent transcript or a chat.
13. **The agent channel is the one labelled exception.** It says in the UI that the box and third-party models can read it. No other channel ever gets that exception by accident, including by a shared code path.

## 7. Everything Wes has asked for, in one place

His sort of Discord's features, 2026-09-21, plus everything he has asked for since. Built items are here so nobody rebuilds them; open items are the backlog.

**Built:** DMs; group DMs; desktop app (Windows, Mac); global push-to-talk; share a game window with its sound (Windows, now Mac); desktop notifications; soundboard; stream quality choice; polls; dice; server pictures; ask for a server; tip jar; text E2EE; pop-out streams; stream comments; song requests; call mixer; YouTube cards; Purdle; pass-along song ("an individual session that's like saved... over the course of the day people can jump back in and see how it's progressing"); Hero Line; Queens; sign out everywhere; password reset; backups.

**Open, from his "Build" list:** profile picture and a short bio (column exists, no way to set it); status (online, idle, do not disturb, invisible, custom line); pinned messages; search through messages; custom emoji; **phone push notifications** ("Is there a way to have notifications through this app structure? like either a noise or a number next to the app... Note it as important." 2026-09-26); phone layout ("Layout issues are the main problems right now. Also when I'm on my app I can't see the other servers I'm in.").

**Open, his own ideas:** guest access ("put in the nice to have something like guest access", 2026-09-23: someone without an account joins one call or channel from a link Wes makes, and is gone after); `/Tang-jump`, his D&D characters jumping across the chat; 82-0 roster game ("Put it in the maybe pile"); two devices on one account in the same call (known bug, per-device identity).

**Later, wanted, not now:** threads, events, AFK channel, voice messages, camera background blur, spoiler tags, saved GIFs, block a user, bookmarks and forwarding, "Playing X" activity, webhooks, friends list, timeout a member, `/roll` and built-in commands.

**Skip:** link previews ("Who cares"), stickers, forum channels, stage channels, bots and app directory, in-game overlay, server folders, discovery, templates, onboarding, AutoMod, Nitro, boosts, shop, quests.

**Standards he holds the app to:** "some of the UI is kind of funky... we'll definitely need a good UI pass" (2026-09-21); sounds: "short clips. Light. Not too sharp. Engaging."; screen share is "a very important function of this app"; every desktop change ships "with intentions of updating it for both windows and Mac"; "it should work on all three; members use Mac and Linux."

**Trey's and Matt's asks on record:** Trey: Mac audio fully working ("share audio w/ stream, do the music stream thing, all audio stuff that doesn't currently work on mac, should"), the agent channel. Matt: better play on iPhone, iPad and Android; one place to balance everyone in a call; audio-only music sharing others choose to hear (the mixer, built).

## 8. A build order Trey can change

A proposal, in the order that makes the public story true soonest. Each phase ends runnable, with a screenshot in `docs/HANDOFF.md` and a PR. Riskiest and most optional work last. Trey owns the plan from here; this is the starting point, not a fence.

**Ground rules for every builder.** Own branch from `main`, named for the phase. Never push to `main`, never touch another builder's branch, never touch `infra/`, `.env*`, signing or publish scripts. PR to `main` when a phase is runnable. Stuck rule: two honest attempts, log it under "Open problems" in this file, move on. Match surrounding code; no emoji; short plain UI text; `node --check` after every edit; restart the dev API after adding a migration or route; no temp copies or junctioned `node_modules` (a worktree removal once wiped the checkout). Read first: `CLAUDE.md`, `GAMEPLAN.md`, the top of `docs/HANDOFF.md`, `PAPERCUTS.md`, then the file for your phase.

**Before the public sees it: Wes's list (2026-10-28, his words).** These are not a phase; they are the things he already knows are wrong, and two of them block the guest door (phase 3) because a stranger's first call is the first impression.

- **Voice join for new people (blocks phase 3).** "When new people join Scry, and then they jump into a channel that like people are already in and talking in, basically like they can't hear, and you have to like, they have to join, then leave, then join again or something like that. And it can be a kind of bad first impression potentially." Find it with instruments (rule 7), fix the cause, not the symptom.
- **Windows app message delivery (blocks phase 3).** "I still don't think the app on Windows still acts weird. Like sometimes messages don't come through like when they should. It's obviously, you know, we're doing a workaround, which is fine for now, but eventually we do need to have like an official app that works properly."
- **Phone.** "Just kind of a little janky on phone. It technically works, but navigating things is just a little janky." Pairs with Matt's report and the phone layout item in section 7; it is the same job.
- **Remove the Loaf theme.** And **remove the first theme, the static version.** Two themes nobody outside should see; builder finds them by name in the theme list.
- **Sounds.** "Eventually we'd need like a sound upgrade. I know they're basic ones that you generated, but eventually we should just generate some actual good sounds or find some good sounds for notifications and all that stuff." His standard from 2026-10-01: "short clips. Light. Not too sharp. Engaging." Licence-clean sources only; nothing that phones home to fetch them.
- **General cleanup of everything.** Dead code, stale UI text, half-finished screens, anything a stranger would hit before a friend would.
- **"All the other obvious things of if we did go public, the things we'd have to modify."** The builder keeps a running list under "Open problems" in this file as they find them: sign-up wording that assumes you know Wes, the tip jar on boxes that are not ours, error text that names our box, the audit log and export working for an owner who is not Wes.

**Phase 0. Public-readiness audit** (only if Wes picks public code). Scan the full git history for secrets, keys, IPs, member names and anything that should not leave the group; list every hit with a fix (rewrite, redact, rotate). Check every dependency's licence. Nothing flips public until Wes reads the list and says yes.
Check: the scan report exists and every hit has a decision. Must never happen: the repo goes public before Wes's yes.

**Phase 1. The front door.** A landing page at the root of scryproof.com (or wherever the app's root currently is; builder confirms and proposes) carrying section 4: the one line, who it is for, the three things, the refusals, real screenshots, two buttons: "Try it" (guest link, phase 3) and "Run your own" (phase 5). Static, served by nginx, no scripts from anywhere else, no fonts from anywhere else. Must pass the `ai-tell` gate: Wes judges.
Check: page loads with zero third-party requests (network tab screenshot). Must never happen: a tracker, a font CDN, a stock photo of a person.

**Phase 2. Capacity, measured.** On the current box: a call with 10 participants, then 25, with the connection panel open; one screen share to 10 viewers; report RTT, jitter, loss, CPU, RAM and bandwidth. Exercise the TURN path on purpose (block UDP on one client) and prove a call still connects. This is rule 7: instruments, not guesses.
Check: a table of numbers in `docs/HANDOFF.md`, with the box size confirmed (1 GB or 2 GB). Outcome: Wes decides whether the demo door needs a bigger box before any announcement.

**Phase 3. Guest access.** Wes's own ask. A link, made by a server owner, that lets someone without an account join one named channel (text or voice) for a limited time, with a guest name, and be gone after. Guests get a visible guest badge, no DMs, no invites, no file uploads unless the owner allows it. This is the demo door for strangers and the "try it" button. Permissions computed server-side, as always. E2EE rules hold: a guest is a member of that channel's key group for the duration and is rotated out after.
Check: a stranger with the link, in a private browser window, joins a voice channel, is seen by a member, and cannot see any other channel. Must never happen: a guest link that reaches anything but its one channel.

**Phase 4. Multi-home clients.** Needed for both doors: a paying group's members install the same apps and point them at their box. The web, Windows and Mac clients can point at any Scry server, not only scryproof.com. First launch asks "which Scry?" with scryproof.com as the default; the choice is remembered; switching is a settings item. Builder confirms where the server address is set today before touching it. Self-update stays with Wes's signed releases (the app is the same everywhere; only the server differs).
Check: the Windows app signs into a second Scry instance (the one from phase 5) and into scryproof.com, in turn. Must never happen: the client leaks which server a user is on to anyone but that server.

**Phase 5. The installer.** One script and one page of instructions that take a fresh Ubuntu box and a domain to a running, encrypted Scry: bonesdeploy server setup, site setup, the LUKS volume with the passphrase held by the owner and never on the box, LiveKit with its TURN, nginx with certificates, restic backups to a place the owner names, and the first account becoming the host with "ask for a server" approval in their hands. The unlock-after-reboot flow must be explained in plain words. Written for someone who can open a terminal and follow instructions, not for a developer. Trey's army installs it on a throwaway box they did not set up themselves and times it.
Check: a second Scry, on a box none of us touched by hand, reachable at its own domain, with a voice call E2EE and the connection panel showing it. Must never happen: a default password, a passphrase stored on the box, a step that says "temporarily disable encryption."

**Phase 6. Billing and provisioning (door 2).** Stripe Checkout on Stripe's hosted page for a flat monthly plan; a webhook into a small billing service on our side, never inside the Scry app's code path; on payment, the host's API (DigitalOcean or Hetzner, builder proposes with prices) creates a dedicated box, the phase 5 installer runs unattended, DNS points a subdomain, and the owner gets a sign-in link and the unlock page. Cancel stops the box after a grace period, with an export offered first. A status page for hosted boxes. Stripe never gets a script tag inside the app and never sees a message. Stripe is the one third party in the product, and it lives outside the data path, which is what rule 1 protects.
Check: a Stripe test-mode card buys a plan and a real second Scry exists on its own box within 30 minutes, unlocked by its owner, with an E2EE call in it and the connection panel showing TURN. Must never happen: a customer's content keys or passphrase anywhere in the billing service; two customers on one box; a live charge before Wes's yes.

**Phase 7. Phone push notifications.** Wes's "important" ask. Web push through the PWA with no message content in the payload (count and channel only), served from our own box, no third-party push relay beyond the platform's own (Apple and Google push services are unavoidable for phones; the payload carries nothing readable).
Check: a phone, app closed, gets a badge count and a sound for a DM. Must never happen: message text in a push payload.

**Phase 8. The agent channel.** Trey's epic, from `docs/agent-channel-spec.md` draft 3. Nothing to add here except that it ships with its label (rule 13) and after phases 1 to 6, because the public story needs the door and the install more than it needs the agents on day one. If Trey's audience is the first wave, he may move this up; that is his call to propose and Wes's to approve.

**Phase 9. The open "Build" list.** Profile picture and bio, status, pinned messages, search, custom emoji, phone layout, two devices in one call. Small, each its own PR, in whatever order fits.

What a half-finished 48 hours should still leave: phases 1 and 3 done means a stranger can read the pitch and sit in a call with us. That alone is announceable.

## 9. Wes's picks

The doc is final when these are answered. Recommendation first in each.

1. **Shape.** Answered 2026-10-28: C. Both doors, paid hosting as soon as it can be real.
2. **Public code.** (a) Make the repo public after the phase 0 audit, Wes says when (recommended: a privacy product people cannot read is a weaker pitch, Trey's builders work better in the open, and door 1 needs at least the installer and releases public anyway). (b) Keep the repo private, publish only the installer and the app releases. (c) Stay private; door 1 closes.
3. **Price shape.** (a) One flat monthly price per hosted group, any number of members, somewhere in $10 to $20 (recommended: the box is $6 to $12, backups and our time are the rest, and flat is honest and easy to say out loud). (b) Per seat. (c) A free tier on a shared box plus paid dedicated; this breaks "one box per group" and I would not. The number itself is Wes's. Tips stay in every case.
4. **Business entity.** Stripe needs a legal name, an SSN or EIN, and a bank. (a) Sole proprietor under Wes's name to start, fastest. (b) The Tennessee LLC from the Accounting notes first. Wes does this setup himself, nobody else touches it.
5. **Name.** The domain and the UI say Scryproof; you and Trey say Scry. (a) Scry is the product, Scryproof is our server (recommended). (b) Scryproof everywhere. (c) Scry everywhere, including the domain, later.
6. **Hosted unlock.** After a reboot, who unlocks a hosted customer's encrypted volume? (a) The customer's owner, from a page, like Wes does today (recommended: rule 9 stays fully true on every box). (b) We hold the passphrase in a separate secrets store so hosted boxes come back without the customer, and the UI says so.
7. **The demo box.** Phase 2 produces numbers. If they say the $6 box cannot hold a demo night, (a) a bigger box before any announcement (your money, your call, roughly $12 to $24 a month), or (b) announce the install path first and keep the demo door small.
8. **The door on scryproof.com.** (a) Guest links to one demo server, approved servers only for people you know (recommended). (b) Open "ask for a server" to anyone on the internet. (c) No strangers on our box at all; the two doors are the only path.
9. **What did I miss.** Every thought you have had about Scry that is not in section 7. Say it, I write it in.

## 10. Decisions I made (overrule any)

- Framed the pitch around ownership ("nobody decides for you"), not around the Google news, so it stays true after December.
- Made one installer the center of both doors, so hosted-for-pay is the self-host kit plus billing and a provisioning script, not a second product.
- Kept Stripe outside the data path: Stripe's hosted checkout page and a webhook, never a script tag in the app. That is how pick 1 and rule 1 both stay true.
- Recommended the customer hold the hosted unlock passphrase (pick 6) so rule 9 stays true on every box, not just ours.
- Put the agent channel at phase 8 in the public order, while naming it the one-of-a-kind feature. Trey can move it.
- Kept the "Skip" list as a product statement rather than a backlog note.
- Treated the 48 hours as Trey's energy, not a deadline, and said so.
- Left the box size as "builder confirms" because the docs disagree.

## 11. Open problems

- Capacity is unmeasured. The largest call on record is a handful of people.
- The box's Node carries an old CA root (HANDOFF).
- No off-PC copy of the SSH key and LUKS header (parked; becomes urgent the day strangers depend on the box).
- Two devices on one account cannot share a call.
- The Mac second-call test with Trey is still waiting on Wes.

## Sources

Wes's quotes are verbatim from `GAMEPLAN.md`, `docs/HANDOFF.md`, `docs/BUILD-ORDER.md`, `docs/discord-features.md`, `docs/briefs/`, and the Milk Project quote ledger. The Discord announcement: Android Authority, Yahoo Tech, VideoCardz, 2026-10-27/28.
