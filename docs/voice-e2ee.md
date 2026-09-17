# How voice encryption works

The promise: **no key that can decrypt a call ever exists on the server.** Not
generated there, not relayed in the clear, not backed up there. Non-negotiable
8, and the reason GAMEPLAN section 1b exists.

The GAMEPLAN said this composition would be small enough to read in one
sitting and would get written up. This is the write-up. Code:
`web/src/lib/voice-crypto.ts`, tests `web/src/tests/voice-crypto.test.ts`.

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
what everyone's key looked like last time and says so loudly if it changes. And
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

## The verification code

Twenty digits, in four groups of five, derived from the user ids and identity
key fingerprints of everyone in the call, sorted.

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
- **Not yet proven against real media.** The agreement is tested end to end in
  Node. `web/src/lib/voice-key-provider.ts` — the piece that hands these keys to
  LiveKit — compiles against livekit-client 2.22.3 and matches its API, but has
  never run against a LiveKit server, because there is not one yet.

## Firefox

Refused from voice with an explanation, not accommodated by turning encryption
off. livekit/client-sdk-js#2103: video published from Firefox with E2EE on
cannot be decrypted by Chromium receivers, and the issue is open with no fix.
Non-negotiable 2 says encryption is never "temporarily" disabled, so the honest
move is to say why.

## Testing it

```bash
npm test          # 49 web tests; the voice ones are most of them
```

The malicious-server cases are the point of the suite. Four defences were each
verified by sabotage — removing the authenticated headers, skipping signature
checks, accepting any epoch, and letting a second key overwrite the first —
and each one breaks the suite. The first of those did *not* break it on the
first attempt, which is how the gap it covers was found.
