# Scry for work: a brainstorm, not a plan

Written 2026-11-05 by Fable from Wes's words, while he is on the road. **Status: brainstorm.** Nothing here is decided, nothing here is in the build order, and `docs/PRODUCT-PROPOSAL.md` stays the authority on what gets built next. This file exists so the idea is written down before it is lost, and so Trey and Matt can react to it.

Wes, 2026-11-05: **"One thing we should maybe plan, or at least brainstorm, is turning this into, like, forking this or whatever into a different type of product for different types of users and clients. Right now its targeting gamers at some point we should probably consider a more corporate professional industry as well."**

Wes, same day, after reading draft 1 of this file: **"I've had slight interest from certain people about marketing slash selling slash giving a version of Scry to small companies to use as their internal messaging system... we would change just about everything with how it works. It would follow the same general rules of either we sell them the software and tell them how to set it up on their own, or they pay us to host... the whole games would get cut probably, or at least the way they work right now... the themes would clean them up to be a little bit more corporate... it would be an entirely different entity, but running on with the same core principles of hyper secure, hyper, you know, encoded, all that stuff... We don't have to build it yet or deploy it or anything like that. It's just a, hey, at some point we may do this. So let's think through it."**

Reading of "entirely different entity," so nobody builds the wrong thing: a different name, a different front door, different defaults, and maybe its own line in the business. The same engine, the same installer, the same apps. Section 4 says why.

---

## The short version

1. **Not a fork.** Three people cannot keep two codebases alive. The work version is the same Scry with a switch set at install: "This Scry is for friends" or "This Scry is for work." The switch changes the defaults (theme, which modules show, sounds, the tip jar, the wording), not the engine. One installer, one set of apps, one set of rules.
2. **The pitch already covers more than gamers.** `VISION.md` says "a D&D table, a gaming crew, a podcast, a family, a small studio." What is gamer is the *surface*: the soundboard, the games folder, song requests, the Loaf theme. A work edition is mostly a different surface plus five or six office features, not a new product.
3. **The one position that makes it honest: Scry is for firms that have to keep secrets, not firms that have to keep records.** This is the whole brainstorm in one line. Details below.
4. **Not now, but not 2027 either.** The friend product is not public yet, nobody has paid, capacity is unmeasured, the LLC is not formed. But the interest is real (Wes has people asking), so the right first step is one pilot company at cost, installed by hand, as soon as the installer exists. Three cheap things done now keep the door open (section 7).
5. **Four picks for Wes** at the end: which kind of company first, whether the company's owner gets a way to read every channel, what "sell them the software" means next to public code, and whether this goes in the proposal now or stays parked.

---

## 1. The tension that decides everything

Every company that buys chat software is one of two kinds, and they want opposite things from encryption.

**Kind A: firms whose duty is confidentiality.** Law firms, accountants, therapists and small medical practices, financial advisors, HR consultants, people doing deals, security researchers, journalists, small dev shops holding clients' code. Their regulator, bar association or client contract tells them to keep things private. For them, "nobody can read it, including the people who run it" is the feature. Slack is a liability they tolerate. Scry fits them as it stands.

**Kind B: companies whose duty is retention and oversight.** Public companies, banks, broker-dealers, anything under a legal hold or a records rule. They are required to be able to read, search and hand over every message. Scry as built cannot serve them, and the only way to serve them is a master key on the server, which breaks rule 8 in `CLAUDE.md` and turns "encrypted" into a lie on the header. We do not build that. The same way the friend product refuses public directories and AutoMod, the work product refuses legal hold and admin read-everything. That refusal is the product statement, and it is the reason a Kind A firm can trust it.

So: **"Scry for work is for firms that have to keep secrets, not firms that have to keep records."** If a buyer needs to read their employees' DMs, they need Slack Enterprise, and that is fine.

The one honest middle: a firm's owner can be a member of every work channel, and a member holds that channel's keys on their own devices, never on the server. That gives a firm its own record of its own channels without the box ever seeing a key. DMs stay between two people. That is a policy a firm sets for itself, not a feature we build, and rule 8 holds untouched. Pick 2 asks whether to go one step further.

## 2. Who it is for, and who it is not

**For:** a firm of three to fifty people who already know each other, with something to protect. A two-partner law office. A therapy practice with five clinicians. An accounting firm in tax season. A ten-person dev shop with three clients' repos. A consultancy that wants one private room per client engagement. Same size band as the friend product, on purpose: one box per group, one owner, no IT department.

**Not for:** anything with an IT department that wants single sign-on through Google or Microsoft (that is a third party in the auth path, rule 1), anything with a compliance officer who needs an archive, anyone over about fifty people, government, defense, anything that needs a certification we do not have (SOC 2, ISO). Say so on the page so the wrong buyers leave early and the right ones trust the page more.

**What a small company uses today, which is the real competition.** Not Slack Enterprise. A company of five to thirty people runs on Slack's free plan, Teams' free plan, a WhatsApp group, or texting. Slack's free plan hides anything older than 90 days ([Slack help](https://slack.com/help/articles/27204752526611), [dupple](https://dupple.com/learn/is-slack-free)). A WhatsApp group lives on employees' personal phones; when someone leaves, they leave with the whole history and the company has no way to remove them from anything. The pitch to a small company is not "encryption." It is: **your company's chat on a box the company owns, not on Slack's free plan and not on your employees' personal phones.** Encrypted is the second sentence.

**The one angle nobody else has:** a consultancy or agency gets one box per client engagement, and at the end hands the client the restore and the keys. "Ours means we can leave" becomes "the client owns the record." No chat product offers that, because no chat product is one box per group.

## 3. What a work edition already has, and what it lacks

| Firms need | Scry today | Gap |
|---|---|---|
| Nobody outside can read it | E2EE text, voice, video, screen share; no key on the server | None. This is the pitch. |
| One tenant per customer, movable | One box per group, restore + DNS change, export as JSON | None. Already better than Slack. |
| Who did what | Audit log, roles computed on the server, 2FA, sign out everywhere | Audit log needs to be readable by an owner who is not Wes (already on the pre-public list). |
| Bring a client into one meeting | Guest links (phase 3 in the proposal) | Not built yet, but already planned for the friend product. |
| Screen share for demos and reviews | Window share with app sound, Windows and Mac | None. |
| Phones | Web client, push planned (phase 7) | Push not built; phone layout "janky" (Wes). Firms will not accept janky. |
| Find things later | Nothing | **Search, pinned messages, threads.** All three are on the open list already; a work edition moves them from "later" to "required." |
| Files | Uploads exist | Previews, a files view per channel, a size limit the owner sets. |
| "Are you around?" | Nothing | **Status** (online, do not disturb, custom line). On the open list. |
| Meetings at a time | Nothing | A channel link with a time on it is enough. No calendar product. Events are on the "later" list. |
| Recording and notes | Nothing | Only ever on the client's own device, never on the box. Transcription the same. Not year one. |
| A quiet, plain look | Themes built for game night | A work default theme; soundboard, games, song requests and the tip jar hidden unless the owner turns them on. Notification sounds that do not sound like a game. |
| Dev shops: agents at the table | Agent channel, built (Trey) | None. For a dev shop this is the hook, and nobody else has it. The label (rule 13) matters more here: a firm must see at a glance which channel is the readable one. |
| A contract and an invoice | Stripe card checkout (planned) | Firms want an invoice, a one-page terms doc, a trust page in plain words (proposal 5.11), a status page and a support path with a response time. Not code, but real work, and it is Wes's. |
| HIPAA for medical | E2EE means the box holds no readable health data | Whether we would still have to sign a Business Associate Agreement is a legal question. Do not say "HIPAA" on any page until a lawyer has answered it. |

Reading the table: the engine is done. The gap is search, pins, threads, status, file previews, push, the phone layout, a work theme and the business paperwork. Every code item on that list is already on the friend product's open list. The work edition does not add a new system; it changes which open items are required.

## 4. The shape: one product, one switch

At install (phase 5) and in "Your server" (proposal 5.5), one setting: **friends** or **work**. It flips defaults only:

- **friends:** today's Scry. Soundboard, games folder, song requests, mixer, dice, tip jar, game-night themes, game-night sounds.
- **work:** plain theme, quiet sounds, modules off by default (any owner can turn them back on), no tip jar, "channel" wording instead of anything playful, search and pins and status in the first screen, the agent channel's label louder.

Two landing pages, two pitches, one download, one installer, one codebase. A friend group that becomes a studio flips the switch. A firm that wants the soundboard on Fridays turns it on. Nothing is removed from the code for either.

What this costs: a flag, a theme, and discipline. The discipline is the expensive part: no gamer assumption gets hard-wired where a flag would do. The tip jar, the Loaf theme and the games folder are the current examples.

## 5. Money, plainly

Friend groups are priced at one flat fee per group, aiming at the number in proposal 5.10. Firms pay differently and expect to: per person per month is the shape they know, and the comparison they make is Slack Pro, Teams and Google Workspace, each a few dollars a seat. A ten-person firm paying what Slack would charge them, on a dedicated box that costs us what the research found, leaves far more per group than any friend group ever will.

| Group | Pays, roughly | Box costs us | What it funds |
|---|---|---|---|
| Friends, one flat fee | the 5.10 number | $6 to $18 | the friend product, barely |
| A ten-person firm, per seat | about what Slack charges them | $12 to $18 | the friend product, comfortably |

Two honest ways to price a firm without breaking "one flat price per group": flat tiers by size (up to 10, up to 25, up to 50), or per seat. The numbers are Wes's and wait for the capacity test like everything else. The point here is only that the work door is where the money is, and the friend door is where the trust is. Both are needed; they are not the same business.

## 6. What a company forces that friends do not

Friends forgive. A company that moved its internal messaging onto Scry does not, and each of these is a decision, not code.

- **Someone to call during business hours.** If the chat is down at 2pm on a Tuesday, the company wants a person within the hour. Three people with day jobs cannot promise that honestly. Options: say plainly what the response time is (next business day) and price for it; or a work customer only ever gets door 1 (self-hosted, their own box, we help) until there is someone whose job it is. Hosted work customers wait for that person.
- **Unlock after a reboot.** Today the owner unlocks the volume after a reboot (rule 9). For friends that is a feature. For a company it means the host reboots the box at 2pm, the owner is in a meeting, and the whole company's chat is locked until they get out. This pushes proposal pick 6 the other way for work boxes: Scry holds the unlock for hosted work customers, says so in the header, and the owner can take it. Self-hosted companies keep it themselves and are told why two people should hold it.
- **An employee leaves.** The admin removes them, their devices lose access from that moment, and channel keys rotate so nothing new reaches them. What they already saw stays on their device, which is true of every encrypted product and should be said on the trust page rather than discovered. Needs checking: that kick and ban rotate every channel key the person held, not only the guest path.
- **Paperwork.** Terms of service, a privacy policy, a one-page "what we can and cannot see," an invoice instead of a card receipt, and a company may ask whether the vendor carries insurance. None of it is code; all of it is Wes's, and all of it must exist before the first company pays.
- **"Sell them the software" and public code.** Proposal pick 2 recommends publishing the code under AGPL. Under AGPL anyone can install Scry for free, so "selling the software" cannot mean a licence; it means selling the install, the support and the hosting (the Red Hat shape), which is what door 1 and door 2 already are. The other road is keeping a work edition closed (friend product public, work extras private), and that stops working the moment the work features are search, pins and status, which the friend product needs too. Pick 3 below.

## 7. When, and what to do now

**Not now, but sooner than draft 1 said.** Order stays as the proposal has it: capacity test, front door, guest access, multi-home clients, installer, billing, ten friend groups at cost. The change since draft 1 is that Wes has people asking. So the first work step is not a work edition; it is **one pilot company, at cost, installed by hand by one of the three of you, the week the installer works.** They get door 1 with a plain theme and the games turned off by hand. In return they are the capacity test for a company (business-hours load, phones, a real offboarding) and the source of the real gap list. The work edition proper starts after that pilot has run a month and a friend group has paid. Earlier than that it is a distraction from the thing that proves the box.

**Three cheap things now, so the door stays open:**

1. **The installer spec gets the switch**, even if only "friends" is implemented at first. One line in phase 5: "the install asks: friends or work; work is not available yet." Costs nothing, stops a builder from hard-wiring the other answer.
2. **Nothing gamer-only gets hard-wired.** Tip jar, soundboard, games folder, song requests and themes are modules an owner can turn off. The pre-public cleanup (proposal 5.13) is the moment to do it, since it already touches the tip jar and the themes.
3. **The trust page is written for a skeptical IT person from day one.** The nerdiest member of every friend group reads it too, so it is not extra work, and it is the first thing a firm's owner sends to the one person who will say no.

**What not to do now:** no work landing page, no work theme, no pricing page, no "HIPAA" anywhere, no second repo.

**One thing only Wes can answer, which decides pick 1:** who the interested people are and what their companies do. A dev shop, a dealership, an accounting office and a clinic are four different first customers with four different gap lists and one of them has a legal question attached.

## 8. Other editions the same switch would carry

Wes said "different types of users and clients," not only firms. The switch generalises. None of these need building; they need not being closed off.

- **The table:** a D&D group. Dice, the `/Tang-jump` idea, music, maps later. Already the friend product with the volume up.
- **The family:** quiet, phone first, push first, nothing playful by default. Push (phase 7) and the phone layout are the whole edition.
- **The practice:** therapists, support groups, recovery groups. Kind A to the bone; the pitch writes itself and the legal question in section 3 is the gate.
- **The shop:** dev shops and studios. The agent channel is the hook. This is Trey's audience and the nearest thing to a work customer that exists today.

## 9. Wes's picks

Recommendation first in each. Say a letter or say nothing; nothing means parked.

1. **Which firm first, when the time comes.** (a) **Dev shops and small studios** (recommended: closest to what exists, the agent channel sells it, they can self-install through door 1, and the three of you know some). (b) Firms with a confidentiality duty (law, accounting, therapy): the stronger pitch and the better money, but needs the legal question answered and the business paperwork done first. (c) Consultancies with one box per client engagement: the most original pitch, the smallest market.
2. **Can a firm's owner read every channel?** (a) **No special feature** (recommended: the owner joins the channels the firm's work happens in and holds those keys on their own devices like any member; DMs stay private; rule 8 holds untouched). (b) An owner-held escrow key on the owner's device that can open any channel in that Scry, shown in every channel's header so members know. Rule 8 still holds since the server never has it, but it changes what "encrypted" means to a member and I would not do it without a real buyer asking.
3. **What "sell them the software" means.** (a) **Code public under AGPL as the proposal recommends; a company pays for the install, the support and the hosting, never for a licence** (recommended: it is what both doors already are, and it keeps one codebase). (b) Friend product public, a work edition kept closed and sold as a licence: stops working once the work features are the ones the friend product needs too. (c) Keep everything private and sell licences: closes door 1 for everyone and reverses pick 2.
4. **Where this lives.** (a) **Parked here**, linked from `PRODUCT-PROPOSAL.md` as a known door, with the three cheap things from section 7 added to the proposal's phase 5 and 5.13 and the pilot added to its build order after billing (recommended). (b) A section in the next proposal draft, so Trey plans for it. (c) Drop it until ten friend groups have paid.

## 10. Decisions I made (overrule any)

- Called it a switch, not a fork, and said why: two codebases would kill a three-person project.
- Put the secrets-versus-records line at the centre, because it is the only way a work product keeps rule 8 and stays honest, and because refusing the wrong buyer is what makes the right buyer trust it.
- Kept every rule in `VISION.md` section 6 intact. No SSO, no email from boxes, no server-side key, no shared box, no Docker, no third party in the data path. A work edition that needs any of those is a different company's product.
- Did not pick numbers. The capacity test and Wes decide prices.
- Said "not now" plainly and gave three cheap things instead, so the idea costs nothing today and nothing closes it off. After Wes said the interest is real, added one pilot company at cost as the first step, because a real company on the box is a better test than a tenth friend group.
- Read "entirely different entity" as a different name and front door on the same engine, and "games would get cut" as off by default rather than deleted, because deleting from a shared codebase costs more than hiding and a company that wants the soundboard on Fridays can have it.
- Took the hosted-unlock lean the other way for work boxes (Scry holds it, labelled), because a company cannot be locked out of its own chat until its owner gets out of a meeting.

## Sources

Wes's words from this session (2026-11-05). `VISION.md` section 7 for what is built and open; `PRODUCT-PROPOSAL.md` sections 4 and 5 for box costs, pricing comparisons and the hosted path; `docs/discord-features.md` for the feature sort.
