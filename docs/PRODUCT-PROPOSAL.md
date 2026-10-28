# Scry beyond our friends: Trey's proposal for what it becomes, with the research and a first spec

This is a proposal, not a decision. Wes decides picks 2 to 8 in the table below and tells us what we missed (pick 9); pick 1 he has already answered. Everything else here is Trey's recommendation with the reasoning attached. Written 2026-10-28 by Trey with his Claude, for Wes and his Claudes, to read before the Wes and Trey call, as an answer to `docs/VISION.md` draft 2. Wes's doc stays the authority on what Scry is and who it is for; `GAMEPLAN.md` stays the authority on how it is built; `CLAUDE.md` holds the rules nobody breaks.

Two research reports sit behind the numbers, both in `docs/research/` with every price cited to the provider's own page as read on 2026-10-28: `2026-10-28-box-providers.md` on hosting providers, box sizes and resale terms, and `2026-10-28-pricing-and-docker.md` on what comparable businesses charge and on Docker.

**Who "we" means in this document.** Scry the business is Wes's to run: the company he forms (pick 4), his Stripe account, his hosting-provider account, and his yes on everything that ships. Trey and his agents build the product, open pull requests, and run an always-on support agent (section 5.9) on Trey's own machine. The small program that takes payments and creates boxes (the billing service, section 5.4) is part of the product and runs on a box the company pays for, under Wes's accounts. Nothing of a customer's, and no key to a customer's box, ever sits on Trey's machines.

---

## The short version, and what Wes decides

**Wes decides seven things on the call:** whether the code goes public and under what license; the shape of the price (the number comes later); whether to form the LLC now; the product's name; who holds a hosted box's unlock key by default; nothing about the demo box until it is measured; and how open the door on scryproof.com is. He also tells us what we missed. The table at the end of this section has our recommendation for each, and section 6 the reasoning.

**The one line.** Scry is a fast, fun, secure Discord that's actually yours. Wes's own order of priorities is "it's ours, our data is secure, and latency," and everything below is sorted by that order. "Yours" comes first because it is the one word no competitor can say: Signal and Matrix can claim secure; nobody else gives a group of friends a box they hold, move, and leave with.

**Two ways in, and the names used for them here.** "Run your own": a free installer takes a fresh Ubuntu box and a domain to a running Scry. "Let us host it": the same installer on a dedicated box per paying group, billed monthly. Wes picked both on 2026-10-28, and we agree.

**Three facts that changed since draft 2.**

1. **The agent channel is built.** Draft 2 calls it "not started" and puts it eighth. It is built, reviewed by a second model family, every test green, and waiting on Trey's word to go to GitHub. Wes cannot see it because it sits on Trey's private branch. It should move up the order.
2. **A box for a group of strangers may cost more than the $6 Wes pays today.** The research recommends testing on a 2 vCPU / 2 GB box, which is $18 a month at DigitalOcean, and its own first price suggestion was $30 a month because of that assumption. What is left per group after the box and card fees: on the $18 box, a $20 price loses about $2; on the $12 box, $20 keeps about $4; on today's $6 box, $15 keeps about $5. Nobody has load-tested Scry; Wes's whole group runs on the $6 box with about 500 MB in use. So the capacity test (real calls of 10 and then 25 people on the $6, $12 and $18 boxes, connection panel open, section 5.14) is now the gate on the price.
3. **The market for "one server for your group" sits at $6 to $19 a month.** masto.host (one Mastodon server per customer) charges $6, $9 and $19. TeamSpeak's hosted servers are $5 to $18. Game-server hosts (Shockbyte, Nitrado, G-Portal) charge $6 to $16 for what a friend group buys. Discord Nitro is $10 per person. $30 would be above every comparison a customer makes.

**Five recommendations.**

- One installer behind both ways in.
- The owner never sees a server: a "Your server" tab inside Scry does everything.
- For hosted boxes, Scry holds the unlock passphrase by default, says so in the header, and the owner can take it.
- No free boxes, and no email from boxes.
- One flat price per group, set after the box is measured, aiming at $15 to $20.

**The picks.** Our recommendation for each; section 6 has the reasoning and what Wes decides.

| Pick | Recommendation |
|---|---|
| 1. Shape | Both ways in. Answered by Wes; we agree. |
| 2. Public code | Yes, under AGPL (open source, and anyone who hosts a modified copy must publish their changes), after the code history is audited for secrets, when Wes says. |
| 3. Price shape | One flat price per group, number set after the capacity test, aiming at $15 to $20, with an annual option. |
| 4. Entity | The Tennessee LLC, before the first stranger pays. Section 6 says why. |
| 5. Name | Scry is the product, Scryproof is our server. Trademark search first: "scry" is a Magic: The Gathering term and Scryfall is the card database every Magic player uses. |
| 6. Hosted unlock | Scry holds it by default, labelled in the header; the owner can take it. |
| 7. Demo box (whether scryproof.com needs a bigger box before strangers try it) | Measure first. The capacity test decides the box, the price and the demo. |
| 8. The door on scryproof.com (how strangers get in) | Guest links into one demo server; approved servers only for people Wes knows. |
| 9. What was missed | One identity across every Scry you join, as on Discord (the one we most want Wes's instinct on); a tool to bring a server over from Discord; email; updating many boxes at once; support; the license; the trademark; the federal law on reporting illegal material involving minors; and the agent channel being done. |

---

## 1. Seven things that stay true

Seven beliefs, all Wes's, lead to one conclusion: one box per group, never many groups on a box Scry runs. The beliefs are in his words or in what he built, none depends on anything Discord announces, and the rest of this document is checked against them.

**A group of friends wants a place that is theirs.** Wes said it as "it's ours," and `GAMEPLAN.md` made it concrete: "'Ours' means we can leave." A place is yours when you can hold it, move it and leave with everything in it. That rules out the shape every other chat product takes, where your group is a row in someone else's database.

**The people who run the place should not be able to read it.** Wes: "as secure and private as possible, knowing we don't control DigitalOcean." The rule that follows is the eighth of Wes's nine: no key that decrypts members' content ever exists on the server. Scry's voice, video, screen share, DMs, group DMs and private channels are encrypted end to end today. Regular server channels are not; in a regular channel everybody knows the server owner can read along, and so could anyone who looks inside the box. The product has to keep saying which is which.

**Voice has to be good or nothing else matters.** Latency is Wes's third priority, and the connection panel in every voice UI (his seventh rule) is how Scry proves it rather than claims it. A group that cannot hear each other leaves, whatever else the product does.

**It has to be fun or nobody shows up.** This is not in Wes's three words; it is in everything he built: Tang, the Loaf theme, Purdle, Drain The Swamp, pass-along song, a hundred soundboard clips, dice, polls, a mixer so one friend is not three times louder than the rest. Every "private chat" product on the market is joyless. Scry is a clubhouse that happens to be encrypted, not a privacy product with chat attached. This is the moat nobody copies by adding a feature.

**Platforms change their minds.** Discord's announcement of 2026-10-27 is one instance; there will be another. The only protection that survives the next announcement is ownership: a server nobody else can change the rules on.

**You can only promise what you can prove.** The UI says "encrypted" only where it is true. The connection panel shows numbers instead of a green dot. The same discipline applies to the business: no "up to 50 people" until 50 people have been tested, and no price until the box it runs on has been measured.

**Small groups, not crowds.** Everything wrong with Discord comes from scale: discovery, AutoMod, a bot store, a shop, and now indexing. Everything right with Scry comes from the opposite: three to fifty people who already know each other. Wes's "Skip" list in `docs/discord-features.md` is a product statement, not a backlog.

**What follows.** If a group's place is theirs, it has to be a thing they can hold: one box per group. Putting many groups on one box Scry runs would make the place Scry's, not theirs, and would make Scry the party who can change the rules. So "let us host it" means a dedicated box per paying group, the same software as everyone else's, and a single restore that moves a group from Scry's box to their own or back.

---

## 2. The vision as we understand it

**Who it is for.** Groups who already exist. A D&D table, a raid group, a podcast, a family, a small studio, the crew that has shared a Discord server since 2018. Three to fifty people. One of them is the person who always sets things up (the DM, the raid leader), and that person is the customer. A group that needs a public directory, stage channels, Nitro or a shop needs Discord, and that is fine.

**What the news does and does not do.** Discord's change only touches Discoverable Servers: 1,000 or more members, eight weeks old, opted into Discord's public directory. Server pages with AI summaries arrive 2026-11-16; individual messages reach Google in mid-December. Private servers, DMs and group DMs are not included, and nobody in our group posts in a server that size. But nobody reads the fine print, and the feeling spreading is "Discord is putting my messages on Google." The pitch rides that feeling without lying:

> Discord decided, on its own, what happens to what you wrote. It will decide again. Scry is the Discord your group owns, so nobody decides for you. Not Discord, not a host, not us.

That stays true in December and the next time any platform changes its mind.

**Two ways in now, a third later.** Run your own, or let us host it (section 5.1 has both in full). Later, a box in your closet: a small computer with Scry pre-installed, plugged into a home network, the purest version of "ours." scryproof.com stays Wes's and his friends', with a guest door so a stranger can sit in a real call before choosing.

**One restore moves you between all of them.** "Ours means we can leave" applies to Scry too. A hosted group downloads its encrypted backup and runs it on their own box; a self-hosted group hands Scry theirs and stops running it. No hosted product offers that line, and it belongs at the top of the hosted page: pay us, leave whenever, take everything.

**The second story: the agent channel.** One channel where members' coding agents join as named participants, with the one honest exception to the privacy posture labelled in the UI. Trey's audience is people who build with AI agents, and for them this is the reason to move, separate from the privacy crowd; Discord's bot rules make it structurally impossible there. Both stories go out together, and the landing page lets a visitor choose which to read.

**What "beyond our friends" honestly means.** Not Discord's scale. The model is the one Ghost uses (the open-source blogging platform whose company pays for the software by hosting it for people who would rather not): open code, a free installer, and a hosted version for money. masto.host, the closest analog to "let us host it," is run by one person who wrote in 2022 that after counting his own time the business had been net negative for years. Hundreds of groups in the first year is a success; thousands is a real small business; the point of the money is that it pays for the boxes and Wes's time so the thing can exist for more people than his friends.

---

## 3. Rules for the build

Wes's nine rules in `CLAUDE.md` hold on every box, and draft 2's four additions (every rule on every box; Wes's yes before anything ships; Wes keeps the signing keys; the agent channel is the one labelled exception) stay as written. These are the rules the spec adds, each a consequence of section 1.

**One installer, both ways in.** The self-host installer and the hosted provisioning script run the same code on the same kind of box. Hosted is self-host plus billing. A second code path for hosted boxes is where rules get quietly bent.

**The owner never sees a server.** No Ubuntu, no SSH, no IP address, no "here is your root password." The box is a thing with a name, a status light, a storage bar and an update button, the way a Sonos or a Synology is. Wes is the test reader: if a step would make him ask what a word means, the step is wrong.

**Say what Scry can see.** Every place where someone other than the group can see or do something gets one plain sentence in the UI, and one page (section 5.11) carries the whole list. Today the list is:

- the agent channel: the box and third-party models can read it;
- regular server channels: the box can read them; DMs, private channels and calls it cannot;
- a hosted box's heartbeat: a short "I'm alive" message the box sends Scry (up, version, disk, last backup, nothing else);
- who holds the unlock key;
- who signs the clients;
- who runs the subdomain's DNS;
- that Scry's billing service can reset a hosted owner's password.

Trust comes from the list being short and complete, not from the list being hidden.

**Measure before promising.** No capacity claim, no price, and no demo night until the capacity test in section 5.14 has run.

**No free boxes.** A box costs money the second it exists, and free boxes are what stolen cards buy. The trial is the guest door, which costs nothing.

**Boxes send no email.** Scry sends no email today and should keep not sending it (section 5.7 says how). Mail from a thousand boxes is a deliverability job nobody wants, most providers block outbound mail on new accounts, and a third-party mail service would see addresses and reset links.

**Price for Wes's time, not the server bill.** The server is the smallest cost. Support, updates, backups, a status page and the hours answering questions are the rest. masto.host's founder priced to the server bill and wrote in 2022 that, once he counted his own hours, the business had never paid for them.

**Leaving is one click.** The "Your server" tab has a button that downloads everything and a button that moves the group to their own box. If leaving is hard, "ours" is a slogan.

---

## 4. What the research found

Four findings, in seven short sections: build on DigitalOcean; test on its $18 box but expect the $6 or $12 box to be enough; the market for one server per group is $5 to $19 a month; and hosting strangers puts a short list of legal duties on Wes's company. The two provider numbers that matter most (DigitalOcean's prices and the price increase at Hetzner, the German provider most self-hosters use) were re-read by hand on the providers' own pages; the rest are from the two reports.

### 4.1 What a box costs, and which provider

DigitalOcean first, because Scry already runs there and its 2026 partner terms allow reselling as part of our own product (the research read the terms; Scry-specific approval still needs asking). The box to test on is DigitalOcean's 2 vCPU / 2 GB at $18 a month; the box Wes's group runs on today is 1 vCPU / 1 GB at $6, and nobody knows yet which one a group of strangers needs (section 5.14 settles it). A vCPU is a share of a processor core. "Transfer" is how much data may leave the box each month before the provider charges extra. A public IPv4 address is what a box needs to be reachable from the internet, and some providers now charge for it separately. Vultr and Lightsail (Amazon's simple-hosting brand) are DigitalOcean's closest competitors.

| Provider and box | Price a month | Transfer included | Extra transfer | Notes |
|---|---|---|---|---|
| DigitalOcean, 1 vCPU / 1 GB (today's box) | $6 | 1 TB | about $9 per TB | IPv4 included; free DNS; billed by the second. |
| DigitalOcean, 1 vCPU / 2 GB | $12 | 2 TB | about $9 per TB | Same. |
| DigitalOcean, 2 vCPU / 2 GB (the test box) | $18 | 3 TB | about $9 per TB | Same. |
| Vultr, 2 vCPU / 2 GB | $15 | 3 TB | $10 per TB | Worth a test; whether their terms allow us to resell needs a written answer from them. |
| AWS Lightsail, 2 vCPU / 2 GB | $12 | 3 TB, inbound counts too | $90 per TB | Out for any group that does video. |
| Hetzner, US, 2 vCPU / 2 GB | $20.49 plus IPv4 | 1 TB | $1.20 per TB | Tripled on 2026-06-15; the marketing page still shows the old price. Out. |
| Hetzner, Germany or Finland, 2 vCPU / 4 GB | about €6, IPv4 in | 20 TB | €1 per TB | A third of the US price with seven times the transfer. The option when a European group asks; too far for US voice. |

On top of the box: about $2 a month for a separate 20 GB encrypted data disk, and a placeholder $1 a month for off-site backups (not yet priced). Provider snapshots exclude attached disks at DigitalOcean, Vultr and Hetzner, so Scry's own encrypted backups to a place Scry names are the real backup, and the installer has to prove a restore onto a fresh box.

### 4.2 What a call costs on top of the box

Voice costs nothing extra; an all-cameras video night could cost a few dollars a month; nobody knows the mix until there are customers. The reason video costs anything: the box is the hub of every call, each person sends one stream in and the box sends it out to everyone else, so ten people on camera is ten streams in and ninety out. The provider report's assumptions are pessimistic (everyone's camera sent at full size to everyone); in practice the app sends a smaller picture to a small tile.

| Ten people | Leaving the box, per hour |
|---|---|
| Voice only | about 1 GB |
| One screen share to the other nine | about 9 GB |
| Everyone on camera | about 40 GB |

A group doing a three-hour all-cameras night every night of the month would push about 3.6 TB, just past the $18 box's 3 TB, for roughly $6 extra that month. A voice group all month uses about 100 GB.

### 4.3 What comparable businesses charge

Every business that sells one server per group prices it flat, per group or per box, never per friend, and the range is $5 to $19 a month. The two comparisons that matter most are the game-server hosts, because they sell exactly what "let us host it" sells (a non-technical customer, a server for their friends, a web panel, a flat monthly price), and masto.host, because it is one person hosting one open-source server per customer with updates and backups included.

| Business | What it sells | Price a month |
|---|---|---|
| Shockbyte, Apex, Bisect, Nitrado, G-Portal | One game server per friend group, with a control panel | $6 to $16 at friend-group sizes |
| masto.host | One Mastodon server per customer, hosting, updates and backups included | $6, $9, $19 by size |
| TeamSpeak, hosted | One voice server per group, by simultaneous slots | $5 for 10, $9 for 25, $18 for 60 |
| Discord, for comparison | Nitro, per person, not per group | $9.99; $2.99 for Basic |

masto.host's prices were checked by hand; the rest are from the report.

### 4.4 The margin, by box and by price

The box size decides the price, which is why the capacity test comes first. The cost in each column heading is the box plus the $2 disk plus the $1 backup placeholder; the cells also take off Stripe's fees (2.9% plus 30 cents per charge, plus 0.7% for subscriptions). What is left per group per month:

| Group pays | On the $6 box (box, disk and backup $9) | On the $12 box ($15) | On the $18 box ($21) |
|---|---|---|---|
| $15 | about $5 | about −$1 | about −$7 |
| $20 | about $10 | about $4 | about −$2 |
| $25 | about $15 | about $9 | about $3 |

Nothing in those numbers covers support time, a status page, or a bad month; they are the floor, not the business.

### 4.5 Could someone else host the boxes for us? No.

Trey asked whether the companies now selling machines for AI agents, or the companies that host open-source apps for a fee, could run "let us host it" for Scry. None fits, for one of three reasons each:

- They run Docker, which Wes's fifth rule forbids, and their rules discourage apps that push a lot of video: PikaPods, Cloudron, Elestio.
- They sell machines that pause, expire, or sit behind their own proxy, not an always-on box with a public address: E2B, Modal, Daytona, Runloop, Morph.
- They could run it, but every call would pass through a machine of theirs on the way (a third party in the data path, which Wes's first rule forbids), and they cost more: Fly about $38 a group at 1 TB of video, Northflank about $110.

The game-server control panels (Pelican with a billing add-on) give a lovely customer panel but pack many customers onto shared machines, so "one box per group" stops being true. The answer is to create plain boxes through a provider's API, DigitalOcean first.

### 4.6 Docker: not now, and what it would cost if later

Not today's decision. Docker on the same dedicated box costs exactly the same; it is packaging, not infrastructure, and for "let us host it" it buys nothing because Scry runs the installer either way.

What it would buy, for "run your own":

- a listing in the catalogs self-hosting hobbyists install from (Umbrel, CasaOS, Unraid, TrueNAS, Synology), which take only Docker packages;
- an easier install for people who already run Docker.

What it would cost:

- Wes's fifth rule, for the reason `GAMEPLAN.md` gives: a program running as root and a download registry added to the list of things that must be trusted;
- a trap the report found: Docker opens ports on the box past the firewall without saying so, so the firewall has to be checked from outside;
- a second trap: the media server's own docs say to let its container share the box's network directly, which undoes most of the separation Docker is supposed to give.

If the app-store audience turns out to matter, a Docker package can ship later as a second self-host path, at the cost of maintaining two.

### 4.7 What the law asks of Wes as a host

Taking a stranger's money to run their server makes Wes's company a service provider under US law, and that puts six things on Wes's list, none of which end-to-end encryption removes. Not legal advice; a list to take to a lawyer once, before the first customer pays.

1. **Register with NCMEC and write a one-page reporting process.** The federal reporting law (18 U.S.C. § 2258A) requires any provider of an electronic communication service to the public to report illegal material involving minors to NCMEC, the national clearinghouse for such reports, when the provider obtains actual knowledge of it (someone has shown or told them), and to keep what it reported for a year. The process is: preserve, file, terminate the box, look no further than necessary.
2. **Put a report button in the app**, so knowledge can arrive. For encrypted channels only a member can send Scry what they saw; for regular channels the material is on the group's box.
3. **Write terms of service, a privacy policy and an acceptable-use policy** that prohibit such material and let Scry terminate a box. masto.host's are a good model: short, plain, and they say which communities will be asked to leave.
4. **File a DMCA agent** with the Copyright Office, a small filing that keeps a host from being liable for what users upload.
5. **Turn on Stripe Tax** once the Stripe account exists; Tennessee taxes software subscriptions.
6. **Decide about Europe and the UK.** A European group means a data-processing agreement under GDPR; the UK's Online Safety Act puts duties on any service with UK users, which is why some small services block the UK.

What the law does not ask: scanning. The statute says in its own text that nothing in it requires a provider to monitor users or to "affirmatively search, screen, or scan." The duty is triggered by knowledge, not by the service existing, and that is the legal basis on which Signal, WhatsApp and iMessage run end-to-end encryption in the US. Encrypted content cannot be scanned by design, and the scanning tools that exist (Microsoft's and Google's) send images or their fingerprints to a third party, which Wes's first rule forbids.

---

## 5. The product and the hosted service, piece by piece

Twelve pieces in the order a customer meets them, then Wes's list of what to fix before strangers arrive, then the build order. Each says what it is and why; where an alternative was rejected, it says which.

- 5.1 the ways in
- 5.2 one identity across many Scrys
- 5.3 bringing a server over from Discord
- 5.4 the hosted path from checkout to first call
- 5.5 the owner's control page inside Scry (the "Your server" tab)
- 5.6 unlocking after a reboot
- 5.7 email
- 5.8 updates across many boxes
- 5.9 support
- 5.10 pricing
- 5.11 the trust page, the code and the law
- 5.12 the agent channel
- 5.13 Wes's list, before strangers see it
- 5.14 the build order

### 5.1 Two ways in now, a third later

**Run your own** is free and takes an evening. One script and one page of instructions take a fresh Ubuntu box and a domain to a running Scry built from the same pieces Wes's box runs today: the deploy tool, the encrypted data volume with the passphrase held by the owner, the media server with its relay, nginx with certificates, backups to a place the owner names, and the first account becoming the host. Written for someone who can open a terminal and follow instructions, not for a developer. The code is public if pick 2 says so.

**Let us host it** is the same installer, run by Scry's provisioning script on a dedicated box per group, one box per customer, never shared. They get a subdomain or their own domain, a monthly bill, and a box they never touch.

**A box in your closet**, later: a Raspberry Pi 5 or small x86 machine with an NVMe drive and Scry pre-installed. The owner is physically there, so unlocking after a power cut is trivially theirs. Needs an answer for home networks (port forwarding, or a relay that only ever sees encrypted bytes, which is what the media relay already is), and nobody has tested whether a Pi holds a ten-person call. Named here because it is the purest version of "ours" and a physical product people photograph; not in the first release.

Dedicated rather than shared because a shared box Scry runs makes the place Scry's (section 1), and because one group's video night would be another group's bad call. scryproof.com stays Wes's and his friends' because opening "ask for a server" to the whole internet puts strangers on the box our friends use.

### 5.2 A person across many Scrys

One box per group gives up the stickiest thing Discord has, one identity across every server, and we want Wes's instinct on how far to go in fixing that before anything else in this document. Draft 2 does not name the problem: a separate account on your D&D table's Scry, your raid group's Scry and ours, and no way to DM a friend on a different box.

The minimum for the first release: the web, Windows and Mac clients can point at any Scry server; first launch asks "which Scry?" with scryproof.com as the default; the client keeps a list of your Scrys in the sidebar and switching is one click, not a settings page. Self-update stays with Wes's signed releases; the app is the same everywhere, only the server differs.

The real answer, later: a person is a key their client holds (a keypair: a private half that never leaves the device and a public half that proves it is you), not an account on a box. They prove it to any Scry they join; their friends list is theirs, not any server's; DMs between people on different boxes go direct, end-to-end encrypted, with either box passing the scrambled bytes along without being able to read them. That is not federation (servers talking to servers about everything, a year of work); it is a DM relay plus carried identity. Starting with accounts and moving to carried keys later means every member of every box re-registers once; that is the cost of deferring it. It is the one structural choice that decides whether many Scrys are islands or a network nobody owns, and it is the kind of "right way, not easy way" call Wes has made before.

### 5.3 Bringing a server over from Discord

The first thing to build after the installer and the hosted path, because the people who are angry this month will not rebuild eight years of a server from scratch; migration cost is the whole difference between a curiosity and a move. A tool takes a Discord server (channels, categories, roles, pinned messages, emoji, and message history where Discord's export or a bot with read permission can reach it) and creates the same server on a Scry. Not DMs; Discord does not export them. Imported history lands in regular channels, readable by the owner exactly as it was on Discord; nothing moves into an encrypted channel without the members who hold its keys. On the landing page it is the "Bring your server" button next to "Try it" and "Get your own."

### 5.4 The hosted path, from checkout to first call

The experience that wins: pay, wait a few minutes, get a link, invite your friends. The piece of software that makes it happen is the billing service: a small program, part of the product, running on a box Wes pays for, that listens to Stripe, creates boxes through the provider's API, points DNS, and holds the provider's API key so no customer box ever does. It sits outside the data path (it never sees a message or a call), and the trust page names it.

1. **The landing page.** Static, served by nginx, no scripts or fonts from anywhere else, real screenshots, the one line, who it is for, the three things true here and not there, Wes's refusals, and three buttons: "Try it" (the guest door), "Get your own" (the installer and the hosted option side by side), and "Bring your server" (section 5.3). It must pass Wes's own tell for generic AI pages.
2. **The guest door.** A link, made by a server owner, that lets someone without an account join one named channel for a limited time with a guest badge, no DMs, no invites, no uploads unless allowed. On scryproof.com, only into one demo server, never the real ones. Rate-limited, with a lobby the owner can hold people in, because a public link into a live voice channel is also a raid vector.
3. **Checkout.** Stripe's hosted page, one plan, card required, fourteen days money-back. Stripe sees a name, an email and a card; it never gets a script tag inside the app and never sees a message. Stripe, the billing service's mail provider, and the DNS for subdomains are the three things outside the data path that the trust page lists; no third party is inside it.
4. **The box is built.** The billing service receives Stripe's confirmation, creates a box from a pre-built image (a saved copy of a box with Scry already installed and no secrets in it), runs a short first-boot script with the group's name and address, attaches the encrypted data disk, sets the firewall, and points DNS. Minutes, not the ten to fifteen a from-scratch install takes; the image is what makes "minutes" true.
5. **The setup page.** The page after checkout shows the group's address and a setup link, and says to bookmark it. The same link goes in one email from the billing service. The owner opens it, picks a password and two-factor, and the box is theirs.
6. **A subdomain by default.** Every box gets `crew-name` under a domain Wes picks, with "use my own domain" in settings for those who care. The subdomain's DNS points straight at their box; nothing of Scry's sits in between. Because Scry runs that DNS it could repoint it, so bring-your-own-domain is also the way to remove that last bit of trust, and the trust page says so.
7. **Invite your friends.** Invite links, as today.

### 5.5 The "Your server" tab

The owner's only control surface, inside Scry, in server settings, because the owner already lives there and a second website to manage the box is a second password and a second place to be confused. It shows what the box reports about itself and holds every action a non-technical owner needs:

- Status: up or down, for how long, the version.
- Storage: a bar, and "get more room" as one click with a price.
- Updates: "Scry 1.4 is ready: update tonight, update now, or ask me."
- Backups: last one and when; "download my server" (encrypted, with the restore command); "move to my own box."
- Domain: the subdomain, or "use my own."
- Billing: card, invoices, cancel. Cancel offers the download first, keeps the box for a grace period, then deletes it and everything attached.
- Security: who holds the unlock key, the recovery phrase, "restart my server."
- Help: a form, which goes to the support server (section 5.9).
- Delete everything.

Self-hosters see the same tab without the billing row and the bigger-box offer: one page, every box, every rule the same, and no second product to maintain. Underneath, the box reads its own disk and version locally and, if hosted, sends its heartbeat to the billing service; actions that touch money or the provider (a bigger box, cancel, delete) go to the billing service, which holds the provider key.

### 5.6 Unlocking after a reboot: the one change to Wes's ninth rule

For hosted boxes, Scry's billing service holds the unlock passphrase by default, the box's header says so in one line, and an owner who wants to hold the key takes it in the Security row of the "Your server" tab (5.5). This is the one change to Wes's ninth rule proposed anywhere in this document, and the reason is a product that would otherwise break in week one.

The problem: the ninth rule says the volume passphrase is never on the box and a reboot stays locked until the owner unlocks it. On Wes's box that is Wes, from a page. On a hosted box the provider reboots the machine when it reboots it, at 3 a.m. on a Tuesday, and if only the owner can unlock, the group's Scry is down until the owner wakes up and finds the page. "We keep the box running" is false the first week.

Why this does not weaken the promise that matters: what protects a group's DMs, private channels and calls is end-to-end encryption, which holds completely; no key that decrypts them exists on their box, on the billing service, or anywhere Scry can reach. Disk encryption protects against a stolen disk or a provider snapshot. The ninth rule was written for a box Wes physically controls; stretching it unchanged to boxes Scry runs for strangers makes the product worse without making anyone safer. The passphrases live in a locked file on the billing service's box, never on a customer's box and never on Trey's machines.

The header line has to be true for regular channels too, which the box can read: "Hosted by Scry. We keep the box running and never look inside. Your DMs, private channels and calls are encrypted end to end." An owner who takes the key gets a recovery phrase exactly like the DM recovery phrase that already exists, and the moment their box reports itself locked after a reboot, the support agent (section 5.9) sends them the link to the unlock page, so they are not left to discover it.

Rejected: owner-only unlock as the default (the 3 a.m. problem), and Scry-only unlock with no owner option (takes the choice away from people who care).

### 5.7 Email: none from boxes, three kinds from the billing service

Boxes send no email, now or later; Scry's billing service sends three kinds, ever (your box is ready, your payment failed, your box will be deleted on a date). The product sends none today: sign-up is by invite link, password reset is Wes running a command on the box after the person asks him (it prints a temporary password he hands over), phone notifications are web push, and two-factor has recovery codes. The product works without email because every owner personally knows every member. The spec keeps that and gives it buttons:

- A member's password: the owner resets it from the member list. "Reset password" shows a temporary password, which they hand over however they talk to that person. Safer than email reset: a human who knows you, instead of a link anyone in your inbox can click.
- The owner's own password, hosted: through the billing service, which already has their identity from checkout. This is a power worth naming: whoever runs the billing service can reset a hosted owner's password, so it is on the trust page's list.
- The owner's own password, self-hosted: a recovery phrase chosen at setup.
- The billing service's three emails: your box is ready, your payment failed, your box will be deleted on a date. It sits outside the data path, so it may use an ordinary mail-sending service; its emails carry links, never content.

A password reset never touches encrypted history; that lives on the person's devices and behind their recovery phrase. An owner who wants reset-by-email and email notifications can plug in their own mail provider's key in the "Your server" tab, off by default and labelled as their third party. Rejected: a mail server on every box (providers block outbound mail on new accounts; keeping mail deliverable is a full-time job), and a mail relay Scry runs for all boxes (Scry would see every address and reset link).

### 5.8 Updates across many boxes

A thousand boxes on one bad release is the hidden cost of "one box per group," and it has to be designed before the tenth customer. Boxes pull signed releases from Wes's release server on a schedule the owner picks (nightly, or ask me), using the same signing key the desktop app already trusts. Releases go out in stages: a test box of Scry's first, then Wes's own box if he wants to be first (his call, not assumed), then a tenth of hosted boxes, then all, with a rollback through the deploy tool if a release misbehaves. Database migrations are written so a rollback is possible, or the release says plainly that it is not.

What a box tells Scry: a hosted box sends its heartbeat (alive, version, disk, last backup, nothing else). A self-hosted box sends nothing unless the owner turns update checks on. The trust page lists both in one line each.

### 5.9 Support

Support that is not Wes's DMs is what makes "let us host it" survivable, and the first public use of the agent channel is Scry's own support desk. A "Scry Support" server runs the agent channel, and an always-on agent of Trey's (running on Trey's machine, model costs paid by Trey) is a named participant in it. Every hosted customer is invited at setup, and the Help form in the "Your server" tab posts into the same server, so a customer can ask from inside their own Scry and get the answer there.

What it can see: read-only data from the billing service (is the box up, version, disk, last backup, last heartbeat, subscription state), plus the docs and the changelog. Never any customer's content; it has no path to the inside of a box.

What it can do: first-line answers (how do I, is it down, what changed), and the same safe actions the "Your server" tab exposes (restart, run a backup now, send the unlock link, a bigger box) through the same API, with the verified owner's confirmation in the thread. Anything with money or deletion, any abuse report, and anything it cannot resolve: it pages a human (Trey for product and box problems, Wes for money and legal) and tells the customer so. When it is wrong, the human who was paged answers.

Proactive: it watches heartbeats. A box goes quiet, it messages the owner before they notice. A box comes up locked after a provider reboot, it sends the unlock link within the minute.

Guardrails: an action on a box requires the asker to be that box's verified owner, linked at setup. Customer text is data, not instructions: a confirmation on every action, and destructive ones go to a human. The support server carries the honest agent-channel label, and its welcome message says not to paste passwords or keys. It keeps a ticket per thread, sends Wes a weekly digest, and proposes doc fixes when the same question comes three times.

### 5.10 Pricing: one flat price per group, $15 to $20, set after the test

One plan, per group, flat: "your group, up to the number the capacity test proves," at a number Wes sets after that test, aiming at $15 to $20 a month, with an annual price at a discount to cut cancellations and card fraud. The first ten hosted groups pay only the box's monthly price, with no margin, so Scry learns what a group actually uses and what support actually costs before the number is public.

The anchor on the page is Nitro: at $15 to $20, about what two people pay Discord for Nitro, for the whole crew. The transfer line is plain and matches the box: "Includes 3 TB of transfer a month, about 75 hours of ten-person video" on the $18 box (2 TB on the $12 box, 1 TB on the $6), with visible usage in the "Your server" tab and a message before the line, never a hard cap that kills a call. "If your group regularly needs more, we'll move you to a bigger box for a few dollars more."

Tips stay on scryproof.com, where they go to Wes. On a hosted or self-hosted box the tip jar is the owner's to turn on, pointing at the owner, not at Wes. Two other sources of money, later and smaller: off-site backups for self-hosters, a few dollars a month to store their encrypted snapshots (Scry only ever sees scrambled bytes), and the box in your closet from 5.1, sold as hardware.

Per group rather than per seat, because per seat makes the owner count heads and nag friends, and every comparable in section 4.3 prices per group or per box.

One plan, because the product says three to fifty. A second tier appears when the capacity test shows a fifty-person video night needs a bigger box than a ten-person voice table, with a real cost behind it, and not before.

Not $30, because the research's $30 assumed the $18 box, and $30 is above every comparison a customer makes. The right move is to find out whether the $12 or $6 box holds a real group, not to price for the worst case.

### 5.11 The trust page, the code and the law

**The trust page** is one page, in the reader's words, that says what Scry can and cannot see: "We can reach the server. We never look inside. Your DMs, private channels and calls are encrypted end to end; we could not read them if we tried. Regular channels are readable by your server owner, as on Discord." Then the complete list from section 3 (the agent channel, regular channels, the heartbeat, who holds the unlock key, who signs the clients, who runs the subdomain's DNS, the billing service's reset power) and a security contact. Strangers trust a short honest list, not a padlock icon.

**Public code under AGPL.** A privacy product people cannot read is a weaker pitch, Trey's builders work better in the open, and "run your own" needs the installer and releases public anyway. AGPL rather than MIT because with MIT any provider can offer one-click Scry hosting tomorrow and undercut "let us host it"; AGPL lets anyone self-host but anyone hosting a modified version must publish their changes, which is what Mastodon, Plausible and Cal.com chose for the same reason. Draft 2's audit (every secret, key, IP and member name in the history, listed with a fix) runs first, and nothing flips until Wes reads the list.

**The legal list** in section 4.7, done once with a lawyer: terms, privacy policy, acceptable use, the report button and reporting process, the DMCA agent, Stripe Tax, and the LLC before the first stranger pays. Hosted means liability, and an LLC is what liability protection is for.

**A paid review of the encryption**, not now; it costs $20,000 to $50,000. Public code, the trust page and a threat-model document (one that says who we assume is attacking and what they could get) are the cheap version and are what Signal and Proton started with.

### 5.12 The agent channel: done, so it moves up

It is done, so it should ship with the landing page rather than eighth. Built, reviewed, every test green, on Trey's branch, waiting on his word for GitHub. It ships with its label (draft 2's rule 13: the UI says the box and third-party models can read it), and its first public use is the Scry Support server in 5.9. Where it sits in the order is Trey's to propose and Wes's to approve; the order in section 5.14 reflects the proposal.

### 5.13 Before strangers see it

Wes's own list from draft 2, unchanged, because he is right about every item, plus two of ours:

- Newcomers who join a live voice channel cannot hear until they leave and rejoin. Blocks the guest door.
- The Windows app sometimes does not deliver messages. Blocks the guest door.
- Phone navigation is janky.
- The Loaf and static themes come out.
- Better sounds, licence-clean, to his standard: "short clips. Light. Not too sharp. Engaging."
- General cleanup of dead code, stale text and half-finished screens.
- The running list of things that assume you know Wes: sign-up wording, the tip jar on boxes that are not his, error text that names our box, the audit log and export for an owner who is not Wes.
- Ours: web push to phones was built in September and has never been proven on a real phone.
- Ours: the pre-public audit of the code history.

### 5.14 The build order

Steps 0 to 2 make Scry announceable: the numbers are known, the pitch is public, and a stranger can be in a call with us. The rest follows in the order each step needs the one before it; order, not dates. Trey's agents build each step and open a pull request; Wes reviews, merges and deploys; each step ends with something Wes can open and a screenshot in `docs/HANDOFF.md`.

0. **Measure, and fix Wes's list.** On the $6, $12 and $18 boxes: a call with 10 people, then 25, connection panel open; one screen share to 10 viewers; and a call with one person's direct connection blocked, to prove the relay path works. A table of numbers in HANDOFF. This decides the box, the price and the demo, which is why it moves from draft 2's second phase to first. Trey's agents run the box side; the real calls need Wes's group. The fixes in 5.13 run alongside.
1. **The audit, the license and the trademark search.** Draft 2's audit of the code history for secrets, plus the AGPL decision, plus the search on "Scry." Nothing goes public before this.
2. **The landing page, the guest door (5.4, items 1 and 2), and the agent channel (5.12).** After this a stranger can read the pitch and sit in a call.
3. **The installer, and the "Your server" tab as a self-hoster sees it (5.5 without the billing rows).** Trey's agents install it on a box none of us touched by hand. Whoever builds it also writes down how Wes's box shows its unlock page after a reboot, which works today and which nobody has documented.
4. **Clients that point at any Scry**, with the sidebar of Scrys (5.2). Needed before a hosted customer's friends can install the apps.
5. **The billing service, provisioning, the billing rows of the tab, and the Scry Support server.** Sections 5.4, 5.8 and 5.9. The first ten groups at cost. Needs steps 3 and 4.
6. **Bringing a server over from Discord** (5.3). Needs a hosted path to bring it into.
7. **Phone push, proven on real phones.** Built in September, never proven; Wes marked notifications important.
8. **The small wants.** Profile picture and bio, status, pins, search, custom emoji, two devices in one call. Each its own small pull request, in any order.

---

## 6. The picks, answered

What we recommend for each of draft 2's picks, why, and what Wes decides.

**1. Shape.** Both ways in, answered by Wes on 2026-10-28. We agree, with one order: the installer before billing, because billing is a service wrapped around the installer and the installer has to be unattended before a script can run it.

**2. Public code.** Yes, under AGPL, after the audit, on the day Wes says. What Wes decides: the license (section 5.11 argues AGPL), and the day.

**3. Price shape.** One flat price per group, with an annual option, the number set after step 0, aiming at $15 to $20; the first ten hosted groups at cost. What Wes decides: the number, once the measurement is in.

**4. Entity.** The Tennessee LLC, before the first stranger pays. Sole proprietor is faster and leaves Wes personally liable for a hosted service; Tennessee charges LLCs its own franchise and excise tax, which is the cost of doing it properly. The company should hold the trademark, the domain and the accounts, and each of the three should sign a one-page note giving the company the rights to their code so it can be published under AGPL. What Wes decides: whether to form the company now or at the first paying customer.

**5. Name.** Scry is the product and Scryproof is our server, after a trademark search. "Scry" is a Magic: The Gathering keyword and Scryfall is the card database every Magic player uses daily; the collision may be fine and it may not. What Wes decides: the name, after the search.

**6. Hosted unlock.** Scry holds it by default, one honest line in the header, and the owner can take it (section 5.6). What Wes decides: whether the default is Scry's or the owner's.

**7. Demo box.** Measure first. If step 0 says the $6 box cannot hold a demo night, a $12 or $18 box before any announcement. What Wes decides: nothing until the numbers exist.

**8. The door on scryproof.com.** Guest links into one demo server, approved servers only for people Wes knows. What Wes decides: whether strangers get any door on our box at all.

**9. What was missed.** A person across many Scrys (5.2); bringing a server over from Discord (5.3); email (5.7); updates across many boxes (5.8); support (5.9); the license and the trademark (5.11); the reporting law and the rest of the legal list (4.7); and the agent channel being done (5.12). What Wes decides: the identity question in 5.2 is the one we most want his instinct on.

---

## 7. What we are not sure about

- Whether the $6 or $12 box holds a real group. Step 0 answers it.
- How the unlock page is served after a reboot without a secret on the root disk. The builder of step 3 writes it down.
- Whether the identity question in 5.2 needs solving in the first release or can wait until groups ask for it.
- Whether the app-store audience is worth a Docker packaging later.
- Whether anyone outside our friends will pay. The first ten groups at cost answer it.
- Whether to take European or UK customers at all, given section 4.7.

## Sources

`docs/VISION.md` draft 2 (Wes, 2026-10-28). `docs/research/2026-10-28-box-providers.md` and `docs/research/2026-10-28-pricing-and-docker.md` (Trey's research agents, 2026-10-28, every price cited to the provider's page). `GAMEPLAN.md`, `CLAUDE.md`, `docs/discord-features.md`, `docs/HANDOFF.md` (Wes's living state), `STATE.md` (Trey's side's living state). DigitalOcean droplet pricing and Hetzner's 2026-06-15 price adjustment notice, read by hand 2026-10-28. masto.host pricing, read by hand 2026-10-28.
