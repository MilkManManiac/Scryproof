# Encrypted channels (M7)

Written 2026-09-23, before the code; stage 1 built the same day. The code is the authority once it exists:
`web/src/lib/channel-crypto.ts` (the part the server never sees) and
`server/src/routes/channel-keys.ts` (the part that stores what it cannot open).

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

**Who gets a key.** A device hands keys only to devices it believes: the same
pinning DMs use, where a person's first devices are remembered and a new one
has to be accepted (or vouched for by their recovery phrase). You only send
in a key made by a device you believe. So a server that invents a device for
Wes gets nothing, and one that invents a key gets no messages locked with it.

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
- **Files:** stage 2. Until files are locked the same way, an encrypted channel
  refuses them rather than store a readable file.

## The honest limits

- Same as DMs: long-lived device keys, so no forward secrecy inside an epoch.
  A stolen device plus a copy of the database opens that epoch's messages.
- The server decides who can read a channel (non-negotiable 3), so a hostile
  server could add a person. That person would be visible in the channel's
  "who holds the key" list, and their device would still need to be believed.
  First meeting a person trusts their first devices; same as DMs.
- The browser client comes from the server (GAMEPLAN 1b, finding 2). The
  desktop app does not.
- The signature covers the channel, the key, the author, the reply and the
  mentions, but not the message id, which the server assigns. So the server
  can show one of your signed messages twice, or move it within the same
  channel. It cannot change a word of it or put it in another channel.
- A person's new device must be accepted before it gets a key, and a device
  will not send under a key made by a device it has not accepted, even its
  owner's own. One click each in the lock panel; a recovery phrase skips both.

## Stages

1. **Text.** Create an encrypted channel, send, edit, delete, reply, react,
   pin, mentions, jumps; keys rotate on loss of access and are handed to
   newcomers with history; a test plays the hostile server.
2. **Files and voice messages**, locked in the browser before upload.
3. **Turn it on for an existing channel** (new messages only, with a line in
   the timeline where it starts).
