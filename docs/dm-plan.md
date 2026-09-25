# DMs: the plan

Wes said go on 2026-09-21. One-to-one first, group DMs after. No friends list:
you can DM anyone you share a server with. Encrypted end to end from the first
message (the reasoning is in `docs/discord-features.md`).

## What already exists

- Every browser a person signs in on makes its own identity key, and the
  private half never leaves that browser (`web/src/lib/voice-identity.ts`,
  `voice-crypto.ts`). Voice uses it today.
- Pinning: the first time you see someone's key you remember it, and a changed
  key raises a named warning. Built and tested for voice.
- `messages` already has `ciphertext` and `nonce` columns and the client
  already draws a locked body as "Encrypted message".

## What is missing

- **`device_keys` table.** Voice swaps public keys live, inside the call. A DM
  has to reach someone who is offline, so the server has to hold everyone's
  public keys (public only) and hand them out. This was already on the list as
  the prerequisite for M6 and M7.
- A kind of channel that belongs to two people rather than to a server.
- The DM screens.

## How a message is locked

The sender's browser makes a fresh random key for each message, locks the text
with it, then locks that small key once for every device the other person has
and once for each of the sender's own other devices. The server stores the
locked text and the locked keys. It can see who wrote to whom and when. It
cannot see what.

Who gets a copy is decided from the conversation's member list, which the
client holds, not from the device list the server hands over: a device of
somebody who is not in the conversation gets nothing, however long the server
has been listing it and even if this device already trusted it. When the two
lists disagree the conversation says so. **This does not stop a server that
lies about the member list as well**: it can put somebody in the conversation,
and their devices then get copies like anybody else's. What it cannot do is
stay invisible while doing it, because the person appears in the conversation
and in its member list.

Honest limit of this first version: the device keys are long-lived, so someone
who stole a device's private key later could open old messages they had also
copied from the server. Closing that (keys that roll forward with every
message) is what M7's MLS work does, and this design does not block it.

Time and order are the other soft spot. The seal binds the conversation, the
author and the device, but no clock of its own, so a server could serve an old
message again as if it were new, or put "no" before "yes". What is done about
it: every message now carries the sender's clock inside the seal, so a message
whose sealed time disagrees with the time the server stamps on it is drawn with
the time it was written, and the same sealed bytes served a second time
while the conversation is open are drawn once, at the earliest copy. After a
reload the comparison starts again, and messages from before this change carry
no sealed time at all. A server can still withhold a message, drop one, or
serve a conversation's messages in an order it chose; none of that can be seen
from here.

## Stages, each one ends with something Wes can use

1. **A DM that works.** `device_keys`, publishing a device's public key at
   sign-in, DM channels, a DM list above the servers on the left rail, "Message"
   on anyone in the member list, send and receive in real time, a lock mark that
   is true. Done when Wes and a friend DM on scryproof.com and a database query
   on the box shows scrambled bytes.
2. **It behaves like the rest of the app.** Unread badges, notifications,
   edit, delete, replies, reactions, and attachments locked in the browser
   before upload.
3. **The new-device story.** *Built 2026-09-21; how it works is in
   `web/src/lib/dm-recovery.ts` and HANDOFF.* A new device says plainly that older DMs are
   locked, and why. Then key backup: a recovery phrase Wes keeps, which unlocks
   history on a new device. The phrase never reaches the server.
4. **The safety number.** *Built 2026-09-24.* "Check keys" in a conversation
   shows your own number (this device's identity, twenty digits) and the number
   of every device the server lists for the other people, with whether this
   device trusts each one. Reading yours out over a call or in person and
   hearing theirs match proves that the keys both sides hold are the ones the
   other is really using, so the server is not in the middle. It proves nothing
   about a device nobody compared, and nothing about what the words mean. The
   warning when someone's key changes points here.
5. **Group DMs**, up to ten people, same locking, one locked key per device in
   the group.

## What encrypted DMs cannot have

- Search that runs on the server. Search inside DMs has to run in the browser,
  over what that device has unlocked.
- A notification that shows the message text before the app is open. It will
  say who, not what.
- A way for Wes, as owner, to read or moderate a DM. That is the point, and it
  also means a reported DM can only be seen if one of the two people shows it.
