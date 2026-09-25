# Encrypted channels (M7)

Written 2026-09-23, before the code; stage 1 built the same day. The code is the authority once it exists:
`web/src/lib/channel-crypto.ts` (the part the server never sees) and
`server/src/routes/channel-keys.ts` (the part that stores what it cannot open). On the client the working
half is `web/src/lib/channel-keys.ts`, with `web/src/lib/acceptance.ts` (who a person here has let in) and
`web/src/lib/channel-memory.ts` (what this device remembers about a channel, whatever the server says) beside it.

## What it is

A text channel can be made **end-to-end encrypted** when it is created. In one,
the server stores message text only as scrambled bytes, and holds no key that
unscrambles them. The done-when from GAMEPLAN M7: the owner runs a database
query on the box and cannot read the channel.

## Why not MLS, and why not the DM design as it is

GAMEPLAN says MLS gets a fresh look at M7. The look: MLS earns its weight at
thousands of members; we have about twenty-five. The browser options are still
an unaudited TypeScript library or a Rust build in WebAssembly. Voice already
turned it down for the same reasons (GAMEPLAN 1b, finding 1), and the pieces
we have are small enough to read in one sitting. So: no MLS, no new dependency.

DMs lock each message with its own key, then lock that key for every device.
For a channel that means dozens of locked copies per message, and a newcomer
could never read anything from before they joined, because nobody's device
would ever have made them a copy. Channels need history. So a channel has one
key at a time, called an epoch, and people's devices hand it to each other.

## How it works

**The channel key.** The first person to send in a new epoch makes a random
key on their own device, and signs a short commitment to it with their
device's identity key (the same key voice and DMs use). They lock a copy of the
key for every device of every person who can read the channel, using the same
device-to-device locking DMs use. The server stores the locked copies and the
signed commitment. It cannot open either.

**A message** is locked with the epoch's key and **signed by the sender's
device**. Anyone holding the channel key could forge the lock, but only the
sender's device can make the signature, so nobody in the channel can write in
someone else's name. (Group DMs still have this gap; see HANDOFF.)

**Someone loses access** (kicked, banned, a role taken away, a device
dropped): the next time anyone sends, the server sees that the current key is
held by a device that should not have it, and moves the channel to a new
epoch. The next sender makes a new key and locks it only for the people who can
still read. The person who left keeps what they already saw and gets nothing
after.

**Someone gains access** (new member, a new device): whoever is online and
holds the keys hands them over, locked to the newcomer's device. They get
every epoch, so they can read history, which is what Read message history
means everywhere else in the app. Until someone who has the keys is online,
the newcomer sees "waiting for the key" and not text.

**Who gets a key.** Two questions, asked separately, and both have to be yes
before a byte of key material leaves a device.

*Seen before.* The pin store every part of the app shares: the first time a
person's devices are listed they are remembered, and a key that changes later
is a warning. This is worth keeping, and it is not a permission — a server
that invents a device gets it pinned on first sight, and from then on it looks
like anybody else.

*Accepted here.* A second store holds the devices a **person on this device**
let in. A device is accepted if it is this device itself; if its fingerprint
is in that store; or if it carries a vouch from another device of the same
person that is itself accepted (vouches chain, the way a recovery phrase
vouches for the next laptop). Nothing automatic writes to it: not first sight,
not being listed by the server, not a pin from a DM or a call.

Keys follow acceptance only. A device hands a copy of an epoch key only to
devices somebody here has accepted; a new epoch is locked only for accepted
devices; a message reads as **verified** only from an accepted device
(otherwise it opens and says "unverified device"); and this device will not
*send* under a key that was made by a device nobody here has accepted, even
its owner's own. That last one is the one that matters most: without it a
server could make the channel's current key itself, hand everyone a copy, and
read every message sent under it.

Reading a channel under a key made by a device you have not accepted stays
allowed — the messages each say where they came from, and the lock panel lets
you fix it in one click.

**Someone new arrives.** They ask; anyone online who holds the keys clicks
"Let in" in the channel's lock panel, and they get every epoch. Each person's
own device accepts the newcomer separately, so until Bob accepts Carol,
Carol's messages in Bob's client read "unverified device" — signed, readable,
and marked. In the panel each waiting device shows that device's **safety
number** (the same twenty digits voice uses, over one device), and the panel
shows this device's own, so two people can compare out loud over something the
server does not carry. Each side's number is worked out from its own real key
and the key it was handed for the other, so a server holding the middle cannot
make the two agree.

**What this device does not take the server's word for.** Three things, all of
them one-way, all of them kept in IndexedDB so they survive a restart
(`lib/channel-memory.ts`), and none of them needing a server change:

- **Encryption cannot be turned off.** Once this device has seen a channel
  encrypted, it stays encrypted here, whatever a `channel_update` says
  afterwards. The honest server only ever turns it on and refuses readable
  text in an encrypted channel, so a channel that comes back plain was either
  a mistake or a server after the next message. The store keeps it encrypted,
  the channel shows a line saying the server has denied it, and nothing
  readable is sent: the composer refuses, and so do file uploads and message
  edits, with the memory itself — not a rendered flag — as the check.
- **Plaintext in an encrypted channel is forged.** The server stores no
  readable message in an encrypted channel, so a plain one dated at or after
  the moment encryption started is something the server made up, whatever name
  is on it; it is shown as "not sealed and signed by the person it names" and
  never as text. Messages dated before the switch show as they always did,
  and are only as trustworthy as the server: it stored them readable, and it
  could have written or backdated any of them. The moment of the switch is
  the server's claim too, taken at most as late as the moment this device
  first saw the channel encrypted, and a missing or unreadable one counts as
  "from the beginning". A server can make that moment earlier and hide real
  old messages behind "not shown"; it cannot make it later.
- **Epochs only move forward.** A device remembers the highest epoch it has
  sent under, per channel. A server that says the channel is on an older key
  again — after a removal, say — gets a refusal instead of messages under a
  key the removed member still holds.

**Opened messages are remembered by everything the signature covers**:
channel, epoch, author, sender device, reply target, mentions, nonce,
ciphertext and signature. Not the signature alone, or a server could re-send
one of your signed messages with somebody else's name on it and this client
would print the cached words under the new author, still marked verified.

**The one-time carry-over.** The upgrade that adds these stores copies
everything already pinned into the accepted store, so on the day this ships
every device someone had already met in a DM or a call keeps working in the
channels they share. A pin was made on first sight, so the carry-over also
includes any device the server listed before the update; comparing safety
numbers is how that gets caught. From then on a pin on its own is never
acceptance again.

**Quotes and search.** A reply's quote shows only text this device opened or
checked itself, never text the server attaches to the reply. Search hits and
saved messages go through the same check as the channel.

## What an encrypted channel cannot do

Said in the channel itself, not only here:

- **No search.** The server cannot read it.
- **No polls, no /roll, no initiative tracker.** They are things the server
  works out, and it cannot read what it would be working out.
- **Notifications say who, not what**, like DMs.
- **Not encrypted:** who posted, when, which message a reply points at, which
  emoji people reacted with, who was mentioned, and the channel's name and topic.
  Mentions are named by the sender's device so the server can ping the right
  people without reading the message.
- **Files** are locked like DM files (stage 2): each file has its own key,
  locked in the browser with the channel id bound in; the server stores
  `sealed.bin`, octet-stream, and the size. The name, type and key travel
  inside the signed message. The server refuses a readable file in an
  encrypted channel and a locked one in a plain channel.

## The honest limits

- Same as DMs: long-lived device keys, so no forward secrecy inside an epoch.
  A stolen device plus a copy of the database opens that epoch's messages.
- **Removal cannot be enforced against a lying server.** This is the big one,
  and it is stated here rather than hidden: nothing in this design is signed
  about *who is in the channel*. The server decides membership
  (non-negotiable 3), so a hostile server can keep a removed member listed as
  a reader, and every client that still accepts that member's devices will
  keep handing keys to a device the member still has. The same server can keep
  a key rotating on a schedule that never comes. The server can also invent a
  person and add them to the reader list — they get nothing, because nobody
  here has accepted their device, but the member list will show them. What
  this change does is make that *visible* rather than prevent it: the lock
  panel lists the devices this device has accepted and flags a holder the
  server reports that nobody here let in. Enforcing removal needs signed
  membership — an MLS-class change, milestone 7.
- The lock panel's "who holds the current key" list is what the **server**
  says, and proves nothing on its own; `holders()` returns each of those
  devices with whether this device accepted it, and the panel says which. What
  this device can vouch for is its own accepted list.
- First meeting a person still trusts their first devices *for reading*: a
  device nobody has accepted can be listed, and messages from it open and are
  marked unverified. It gets no key and writes nothing verified until somebody
  clicks "Let in".
- The browser client comes from the server (GAMEPLAN 1b, finding 2). The
  desktop app does not.
- The signature covers the channel, the key, the author, the reply and the
  mentions, but not the message id, which the server assigns. So the server
  can show one of your signed messages twice, or move it within the same
  channel. It cannot change a word of it or put it in another channel. What
  this client will not do is serve you a *cached* opened message under a new
  author: the cache is keyed on the whole signed frame.
- The channel memory is per browser profile, not per account, like the
  identity key and the pin store beside it (see the low item in the review
  about one identity per browser).
- A device that was accepted once keeps getting keys while the server keeps it
  listed, and while the people in the channel keep accepting it. Keeping the
  accepted list small is what the lock panel is for.
- A person's new device must be accepted before it gets a key, and a device
  will not send under a key made by a device it has not accepted, even its
  owner's own. One click each in the lock panel; a recovery phrase skips both.

## Stages

1. **Text.** Create an encrypted channel, send, edit, delete, reply, react,
   pin, mentions, jumps; keys rotate on loss of access and are handed to
   newcomers with history; a test plays the hostile server.
2. **Files and voice messages**, locked in the browser before upload.
   BUILT 2026-09-23 (`sealChannelFile` / `openChannelFile` in
   `channel-crypto.ts`, `SealedFile.tsx`, `POST /attachments?sealed=1`).
3. **Turn it on for an existing channel** (new messages only, with a line in
   the timeline where it starts). BUILT 2026-09-23: Channel settings, "Turn on
   encryption", confirmed twice, one way, needs Manage channels. Sets
   `channels.encryptedAt`; the timeline draws the line there. Old plain
   messages stay readable; an edit to one seals it and clears the readable copy.
4. **Fixes for the hostile-server review** (2026-09-24, findings 2 to 5 on the
   channel side). BUILT 2026-09-24: acceptance separate from pinning, the
   channel memory (no downgrade, forged plaintext, forward-only epochs), a lock
   panel that shows accepted devices and safety numbers, and the opened-message
   cache keyed on the whole signed frame. The red tests in
   `web/src/tests/review-channel-keys.test.ts` are the record of what was
   broken; `docs/reviews/2026-09-24-e2ee-hostile-review.md` says what is left,
   and the limits above say the largest of them out loud: a lying server can
   refill either list, and only signed membership would stop it.
