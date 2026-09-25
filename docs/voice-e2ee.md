# How voice encryption works

The promise: **no key that can decrypt a call ever exists on the server.** Not
generated there, not relayed in the clear, not backed up there. Non-negotiable
8, and the reason GAMEPLAN section 1b exists.

The GAMEPLAN said this composition would be small enough to read in one
sitting and would get written up. This is the write-up. Code:
`web/src/lib/voice-crypto.ts`, tests `web/src/tests/voice-crypto.test.ts`.
Around it: `web/src/lib/voice-session.ts` runs a call,
`web/src/lib/voice-key-provider.ts` hands keys to LiveKit, and
`server/src/gateway/voice.ts` is the relay.

## The plain version

Everybody's device makes up its own secret for scrambling what its microphone
sends. It then locks a copy of that secret in a box that only one other
person's device can open, once per person in the call, and posts those boxes
through the server. The server carries the boxes and cannot open any of them.

Whenever anyone joins or leaves, everybody throws their secret away and makes a
new one. So somebody who leaves hears nothing after they go, and somebody who
arrives cannot unscramble a recording of what was said before.

The one thing a server could still try is lying about who is who — telling Alex
that *its* key belongs to Wes. Two things catch that. Each device remembers
what everyone's key looked like last time and says so loudly if it changes, or
if someone it already knows turns up on a device it has never seen. And
the call panel shows a twenty-digit number derived from everyone's keys: read
it aloud once, in a voice the others recognise, and if everyone's matches, no
server got in between.

## What is on the wire

Two kinds of message, both relayed by the gateway and both opaque to it.

**An announcement**, sent when a device joins:

```
{ userId, deviceId, identityKey, callKey, signature }
```

`identityKey` is the device's long-lived ECDSA P-256 public key. `callKey` is a
throwaway ECDH P-256 public key made for this call and discarded with it.
`signature` covers a length-prefixed encoding of a context string, the call id,
the user id, the device id and both keys — so the pair cannot be split up, the
announcement cannot be replayed into another call, and it cannot be
re-attributed to somebody else.

**A wrapped key**, one per recipient per epoch:

```
{ epoch, senderId, senderDeviceId, recipientId, recipientDeviceId, iv, ciphertext }
```

`ciphertext` is one participant's 32-byte media key under AES-256-GCM. The key
that opens it comes from ECDH between the two devices' call keys, run through
HKDF-SHA256 with the call id as salt and `epoch | senderId | recipientId` as
info, so it differs per direction, per pair and per epoch. The whole header is
the additional authenticated data, which is what binds the device ids — they
are the only fields not already in the derivation.

## How the gateway carries them

Two events, both only ever sent to people who are in the voice channel.

`voice_membership { channelId, epoch, members }` goes to everyone in the room
on every join and leave, including a browser dying and a person being removed
from the server. Mute, deafen, camera and screen share do not move the epoch.

`voice_signal { channelId, epoch, kind, payload, to? }` is the envelope.
`kind` is `announce` or `key`, and `payload` is one of the two messages above.
The gateway stamps `from` with the sender's user id and passes the payload on
unread. With `to` it goes to that one person; without, to everyone else in the
room. Never back to the sender.

What the server checks, all of it about who may put a message in front of whom
and none of it about secrecy: the shape, a size cap of 4096 bytes, a rate limit
per connection, that the sender is in the room, that `to` is in the room, and
that `epoch` is exactly the room's current one. Anything else is dropped
without a reply. `server/src/tests/voice-relay.test.ts`, 17 tests.

On a membership event a client drops anyone no longer present, rotates, gives
LiveKit its own new key, announces itself, and sends its key to everyone it
already trusts. On an announcement it verifies and admits the device, then
sends it a key. On a key it unwraps and hands the result to LiveKit.

**Events are handled strictly one at a time, in arrival order.** Every handler
awaits real cryptography. Without an explicit queue, a wrapped key overtakes
the announcement that was sent just before it, meets a sender it has not
admitted yet, and is refused for good: one side secured, the other waiting for
ever. The two-browser test found exactly that on its first run. The gateway
already delivers in order on one connection; the queue in `voice-session.ts`
keeps that order through the awaits.

## Epochs

The epoch is a number that goes up on every membership change and comes from
the gateway's membership event, because everybody has to be counting the same
thing: a device that joined late cannot know how many changes it missed.

That hands the server the ordering, which it has anyway — it decides what to
relay. What it does not get is any say in the key:

- the key is generated locally and is new on every rotation, whatever number
  arrives, so a replayed "nothing changed" cannot keep a departed member's key
  alive;
- the epoch never moves backwards; a stale number still rotates, to one past
  where we already were.

If the server does lie about the number, the labels disagree, the authenticated
data does not match, keys stop opening, and the call **fails closed** — people
show as unheard rather than the call quietly continuing on a key someone else
chose.

## What is refused, and why it is silent

`unwrapMediaKey` returns null rather than throwing. A call is a place where a
hostile relay can send anything it likes; each of those is an ordinary event to
ignore, not an error that tears the call down. Refused: anything addressed to
another person or device, anything from a device that did not sign an
announcement in this call, anything from another epoch, anything whose tag does
not check, and a *second, different* key for one sender in one epoch — the
first one that opened is the one that counts.

## Who gets a key without anyone being asked

Each device pins the identity keys it has seen, per person and per device, and
every announcement gets a verdict:

- `first-seen`: nobody by this user id has been seen before. Trusted on first
  use and pinned. This is the one leap of faith, and the verification code is
  what closes it.
- `known`: same device, same key as last time.
- `changed`: a device we have pinned, with a different key.
- `new-device`: a person we have pinned, on a device id we have not.

The last one exists because pins are per device. Without it a relay could
invent a fresh device id for someone already known and be waved through as
first contact.

`changed` and `new-device` put the device on hold. No key is sent to it, a key
from it is refused, it is left out of the verification code, and the call
screen shows a banner naming the person and saying what approving means.
Nothing is pinned until a person clicks approve. Until then the two cannot
hear each other, which is the honest state.

## Handing keys to LiveKit

`ScryproofKeyProvider` is a `BaseKeyProvider` with `sharedKey: false` and
ratcheting off, since we rotate with fresh keys instead.

The 32 bytes are imported as **HKDF key material**, not as an AES-GCM key.
LiveKit's worker refuses a raw AES key ("algorithm AES-GCM is currently
unsupported"): it accepts HKDF or PBKDF2 material and derives the frame key
itself. The material is still 32 random bytes that never leave the two devices,
so nothing about who can decrypt changes.

LiveKit keeps a ring of 16 keys per participant. The slot is `epoch % 16`, the
same on the sending and receiving side, so a frame encrypted just before a
rotation still finds its key just after.

## The verification code

Twenty digits, in four groups of five, derived from the user ids and identity
key fingerprints of everyone in the call, sorted.

Two details matter for what the number promises.

Each device builds *its own* entry in that list from its own identity key,
never from what the relay said about it. A server that announces a key of its
own under this device's user and device id — so that both sides of the call
compute the same digits while the server holds every media key — is refused,
and its announcement never replaces the real device in the call. This was a
real hole (hostile-server review, 2026-09-24, finding 1) and the promise above
depended on it.

Reading the code aloud also confirms the keys DMs and encrypted channels use:
voice, DMs and channels share one identity key and one pin table. A
first-contact man-in-the-middle in DMs would show up here as a mismatch, since
that is the only verification ceremony the app has.

It uses PBKDF2-SHA256 at 600,000 iterations, which is doing real work. Twenty
digits is about sixty-six bits, but an attacker does not have to match them by
luck — they can generate identity keys until one produces the digits the
victims expect. A slow derivation is what makes that search cost real time.
Discord's DAVE uses scrypt for the same reason; WebCrypto has no scrypt, so
this is the closest thing it does have. It costs about half a second, once per
membership change.

## What this is not

- **Not audited.** These are standard primitives, but nobody has reviewed this
  particular composition. That is why it is small, why it is written down here,
  and why the tests include a server that cheats.
- **Not MLS.** At twenty-five people MLS's scaling buys nothing, and the
  browser options are an unaudited TypeScript library or a Rust build compiled
  to WebAssembly. Discord's DAVE is the reference for the borrowed parts:
  per-sender keys, rotation on every membership change, verification codes.
- **Not protection against the people in the call.** Anyone who can hear a call
  can record it.
- **Not protection against a compromised client.** The browser downloads its
  code from the box it is trying not to trust. That is finding 2, and the
  desktop app in M6 is the answer to it.
- **Not yet proven beyond one PC.** Two browsers and a local LiveKit 1.13.6.
  Never on the real box, never through TURN, never with three people.
- **One device per person in a call.** LiveKit identifies a participant by the
  token's identity, which is the bare user id, so two devices collide there.

## Firefox

Refused from voice with an explanation, not accommodated by turning encryption
off. livekit/client-sdk-js#2103: video published from Firefox with E2EE on
cannot be decrypted by Chromium receivers, and the issue is open with no fix.
Non-negotiable 2 says encryption is never "temporarily" disabled, so the honest
move is to say why.

## Testing it

```bash
npm test            # 59 web tests, mostly voice, and 17 server tests on the relay
npm run test:voice  # two headless browsers in a real call; see HANDOFF for what it needs
```

The malicious-server cases are the point of the suite. Four defences were each
verified by sabotage — removing the authenticated headers, skipping signature
checks, accepting any epoch, and letting a second key overwrite the first —
and each one breaks the suite. The first of those did *not* break it on the
first attempt, which is how the gap it covers was found.

`test:voice` is the last hop, where Node cannot go. Chromium processes
with separate profiles (two, then a third) join through the real interface against a real LiveKit.
It checks both sides secured, the same code on both, first contact labelled as
such, and decoded audio energy climbing. Then the sabotage: one side's copy of
the other's key is swapped for random bytes. Packets keep arriving and decoded
energy stays at exactly zero, which is what "cannot decrypt" looks like from
outside. Then a leave and rejoin: the epoch moves, fresh keys are exchanged
with nobody touching anything, the verdict is `known`, and audio comes back.
All 14 checks passed on 2026-09-17.
