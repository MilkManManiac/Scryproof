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

Honest limit of this first version: the device keys are long-lived, so someone
who stole a device's private key later could open old messages they had also
copied from the server. Closing that (keys that roll forward with every
message) is what M7's MLS work does, and this design does not block it.

## Stages, each one ends with something Wes can use

1. **A DM that works.** `device_keys`, publishing a device's public key at
   sign-in, DM channels, a DM list above the servers on the left rail, "Message"
   on anyone in the member list, send and receive in real time, a lock mark that
   is true. Done when Wes and a friend DM on scryproof.com and a database query
   on the box shows scrambled bytes.
2. **It behaves like the rest of the app.** Unread badges, notifications,
   edit, delete, replies, reactions, and attachments locked in the browser
   before upload.
3. **The new-device story.** A new device says plainly that older DMs are
   locked, and why. Then key backup: a recovery phrase Wes keeps, which unlocks
   history on a new device. The phrase never reaches the server.
4. **The safety number.** A short code both people can compare, and the
   warning when someone's key changes. Reuses the voice code.
5. **Group DMs**, up to ten people, same locking, one locked key per device in
   the group.

## What encrypted DMs cannot have

- Search that runs on the server. Search inside DMs has to run in the browser,
  over what that device has unlocked.
- A notification that shows the message text before the app is open. It will
  say who, not what.
- A way for Wes, as owner, to read or moderate a DM. That is the point, and it
  also means a reported DM can only be seen if one of the two people shows it.
