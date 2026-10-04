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

What the code does not prove is who is in the call. The list of participants
comes from the server, and a device nobody in the call has met before is let
in without a prompt, the same as anyone's first appearance. A server can add
such a participant with a key of its own; it then gets the call's media key,
and everyone's digits still match, because everyone's list includes it. It
shows as one more person in the call. So the promise is: matching digits mean
nobody is in the middle of the people listed, and people should still
check that the list is who is really there. The panel says so.

Reading the code aloud also confirms the keys DMs and encrypted channels use:
voice, DMs and channels share one identity key and one pin table. A
first-contact man-in-the-middle in DMs would show up here as a mismatch, as it
would when comparing the safety numbers in a DM's "Check keys" or a channel's
lock panel.

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
  token's identity, which stays the bare user id. Joining from another device
  transfers that account's call to it; it does not add a second participant.
  The gateway retires the previous socket before rotating the encryption
  epoch, even when the account stays in the same room. Only the current
  socket may send or receive key envelopes, or clear that call's presence.
  A valid signed announcement retires the previous device's cryptographic
  seat. An unfamiliar device still waits for approval, and a changed key is
  still held: transferring presence is never permission to trust a new key.

## Same-account takeover and terminal disconnects

The observed second-device hang had a control-plane cause: `setVoiceState`
rotated only when the user's room changed. A second connection joining that
same room therefore received no membership event. Its call stayed at epoch
zero, installed no own media key, and sent no announcement. LiveKit could
also disconnect the old participant because both tokens use the user id.
The old socket remained eligible to relay keys, and its later Leave cleared
presence for the whole account. Gateway tests now cover that same-room join,
DM takeover, late mute/leave controls, and envelopes scoped to the owner.
Every explicit join rotates even when the account and socket already own
that room: a rebuilt session has new call keys and cannot start at epoch zero.
The client waits for a correlated gateway ownership acknowledgement before
connecting to LiveKit.

Automatic gateway rejoins use `join: 'resume'`. Ownership is tied to a random
per-document tab id and the authenticated login session, so sibling tabs of
one browser do not share the call claim. The selected tab is retained in
memory through an outage for a ten-minute recovery window, including when
no socket currently owns presence. Explicit leave and server removals clear
it, and expired offline selections are pruned. A different tab must explicitly
claim the call; it cannot win a race just by waking first.

Unlabelled legacy joins get `voice_replaced` instead of silently taking a
selected tab's call. Such a bundle must update to explicitly move a call;
it may still join when there is no other selection. Only the gateway's
`voice_replaced` answer ends a recovering device as moved.

**LiveKit does not control recovery.** In installed livekit-client 2.22.3,
`RoomOptions.reconnectPolicy.nextRetryDelayInMs` returning null stops both
normal signal-resume and full-reconnect scheduling in `RTCEngine.handleDisconnect`.
The SDK's browser-online shortcut can invoke `attemptReconnect` directly,
so the session also tears down on browser offline, Reconnecting, and
SignalReconnecting. No disconnected room is left running an automatic
cached-token retry loop.

An unexpected media disconnect keeps the selected call pending and rebuilds
through gateway approval for at most sixty seconds from the loss, measured
with `Date.now()` so laptop sleep counts. After the bound it ends with
"You were disconnected from the call." and requires an explicit user join.
The same bound covers a gateway that remains open but never answers.
An explicit join made offline retains its claiming callback until accepted;
it does not become an automatic resume. A closed gateway fails fast into waiting for its
next ready; it neither silently drops an ownership request nor turns a
network outage into a terminal failure. Recoverable media failures retry
through gateway approval. Definitive server refusals remain terminal. Automatic transport cleanup is
labelled separately from a human hang-up. A deliberate leave from any login
invalidates all recovery selections for the account, with a short in-memory
left marker; a later resume gets `voice_left` and ends quietly as "You left
this call on another device." An explicit change of room also prevents the
old room resuming. A fresh explicit join may reopen a call.

A resume from the socket already owning the room does not rotate the epoch.
The client retains its call keypair, sender key, admitted identities, and
received sender keys while replacing the media Room and worker, so a new
transport does not invent a different key in that epoch. Explicit joins,
real tab handovers, and actual membership changes still rotate. Losing a
gateway socket clears presence and rotates the peers, so its later rejoin
is a membership change and receives a fresh epoch.

Approval re-announces the approving peer to the approved device. Receiving a
repeat announcement resends the same epoch's sender key, so the key refused
while the sender was held is obtained after approval. It does not rotate or
relax identity checks, and ciphertext is not retained while consent is pending.

**The server can trigger retirement.** A signed announcement from a different
device of a remote user retires their previous seat before consent is decided.
Announcements bind the channel/call id, but do not sign the epoch. A hostile
relay can replay an old signed device announcement or inject a self-signed
new-device announcement to evict the current remote seat. That is denial of
service, not permission to decrypt: new or changed identities still get no
keys until approved. Check the named device warning and read matching
verification codes with the people actually in the call before approving a
replacement. Own-user announcements never retire this device's own seat.
Owner-only routing also prevents the previous device receiving any newly
rotated envelopes sealed for its old call key during the announcement race.

### Token lifetime and reconnects

The application default is now ten minutes, reduced from fifteen. This
bounds a just-issued cached join token to LiveKit 1.13.6's refresh floor.
Reducing it further would not tighten tokens already held by a connected
client: LiveKit immediately refreshes them and refreshes every five minutes,
issuing at least ten minutes of remaining validity. An explicitly configured
longer `LIVEKIT_TOKEN_TTL_SECONDS` still overrides the application default.
See [`RoomManager.refreshToken` at v1.13.6](https://github.com/livekit/livekit/blob/v1.13.6/pkg/service/roommanager.go).

The installed SDK replaces `RTCEngine.token` on `onTokenRefresh` and uses it
for both `resumeConnection` and `restartConnection`; an expired token can
make a full reconnect unrecoverable. Shortening initial expiry therefore
cannot be the ownership lock. Disabling SDK retries and gateway-approved recovery prevent an offline tab
from repeatedly reattaching its cached token. A deliberately forced raw
LiveKit connect can still kick the owner once; that owner recovers through
the gateway using its existing epoch. LiveKit identities stay per account.

### Review verification (2026-10-02)

Targeted Node tests passed 41 server and 51 client checks, with concurrency
capped at eight; both TypeScript project checks passed. The session test
uses real WebCrypto and proves approval secures both directions without
another epoch. Deliberately disabling approval's re-announcement, cross-session
resume refusal, same-room owner rotation, or moved-ending Leave made the
corresponding tests fail. The moved-ending mutation reproduced a real
LiveKit presence ghost rather than only changing a mocked snapshot.

The full browser run passed 109 of 112 checks against LiveKit 1.13.6.
All takeover, owner recovery, and same-channel retry checks passed. The three
failures were the existing screen-zoom checks (wheel in, pan, and double-click
out); the exact pre-change archive from `f4074d2^` passed 88 of 91 and failed
the same three checks on its isolated API and web ports. They are outside
this voice change and were not modified.

After tightening the final legacy-join guard, the focused live takeover run
passed all 25 checks. It blocks only gateway and LiveKit WebSockets, keeps
Vite's HMR connected, moves the call, approves the new identity, and restores
the old device's network. It also forces a cached-token LiveKit-only connect
to kick the owner and proves that owner recovers with decoded encrypted audio.
A fresh legacy gateway socket is refused, an owner can rejoin the same room,
and both moved and failed terminal endings clear owned presence.

Replay locally with the application's API, Vite, and local LiveKit running:

```bash
VOICE_CHECK_WEB=http://localhost:5183 VOICE_CHECK_TAKEOVER_ONLY=1 \
  testrun scryproof voice-takeover -- npm run test:voice
```

This is separate headless Chromium profiles on one Linux machine. Actual Mac
sleep/wake, real microphone/camera permissions, two physical machines, TURN,
and slow or lossy networks still need the coordinator's device test. The
stale-token recovery can briefly interrupt the selected device's media while
its ownership confirmation and encrypted reconnect finish.

### Recovery review verification (2026-10-02)

The second review found that SDK-driven signal resume could run while the
application gateway was offline. That could either turn a single-device
outage into a permanent failed call, or repeatedly reattach a replaced tab
to the selected user's LiveKit identity. SDK retries are now disabled and
all application recovery keeps the pending call until gateway approval.

Targeted checks passed 43 server and 54 client tests, including same-owner
epoch retention, sibling-tab refusal with and without a live owner, obsolete
socket cleanup, pending-call recovery, and definitive permission refusals.
Both TypeScript project checks passed. The requested guards were proved by
mutation: treating a gateway outage as terminal failed the pending-call test;
enabling SDK retries failed the Room policy assertion; rotating on owned
resume failed the unchanged-epoch assertion.

The final focused browser check passed all 32 checks against LiveKit 1.13.6.
A single device's gateway was blocked, its media socket dropped, and the
gateway restored after fifteen seconds: the peer decoded its audio again.
A replaced device's media network returned twenty-five seconds before its
gateway: the selected device had no epoch changes or transport rebuilds.
After approving the replacement, the peer's decoded audio energy was positive.
These checks remain in the harness, and Vite's HMR socket stays untouched.

The full voice check passed 117 of 120 checks. The only failures were the
three existing zoom checks. The coordinator identified the first-run tour
backdrop as the cause and fixed the test's tour state on `mac-integration`;
this branch leaves that independently owned change for integration.

Physical Mac lid-close and Wi-Fi loss still need testing: browser socket
blocking does not suspend JavaScript, reproduce OS device changes, or prove
TURN behavior. Recovery selection expires after the ten-minute outage window
when no tab owns presence; after expiry, the first valid resume may select
an otherwise unowned call.

### Integrated recovery-bound review (2026-10-02)

This follow-up is based on `voice-r3`, including the other Mac lanes and the
first-run tour test correction. Desktop download-store initialization is now
lazy, so importing the bridge without a browser location does not crash the
voice unit tests. The targeted checks include the Mac, Windows, Mac-browser,
and platform wiring files, run from the web workspace so its JSX configuration
is used. The recovery-bound test advances wall clock across sixty seconds,
not just a timer tick, and an offline explicit join keeps `join: true`.

The browser expiry case uses a short override on the dev-only `__voice`
instance; the shipped constructor default is sixty seconds. The staggered
probe now returns media immediately after approval, checks the actual Room
retry policy as well as epoch and transport stability, and must turn red if
SDK retry is enabled. Another case explicitly hangs up the selected device
while its sibling is offline and verifies the sibling ends with the left
message rather than restoring its microphone.

Compatibility note: an old bundle without tab ids cannot safely identify its
resuming tab after a socket change. It may still see the moved message until
it reloads the updated bundle. Mapping all such tabs to the login cookie
would reintroduce the sibling-tab takeover bug, so that fallback is not used.

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


Final `voice-r4` verification: 125 of 125 real LiveKit browser checks passed
on the integrated tree, including the tour-state fix. Targeted tests passed
102 web checks (voice plus all four desktop wiring/platform files) and 44
server checks; both TypeScript project checks passed. The wall-clock expiry,
deliberate-leave marker, and staggered SDK-policy guard were each made red
by mutation before restoring them. Importing desktop wiring no longer reads
a browser location at module load.

The live ending probe exposed a second-device join race: an account-wide
old departure could cancel the new device's pending join. Presence now carries
a server-stamped owner tab, and the client only applies an own-call departure
for that tab. The ending checks measure visible membership and decoded audio;
LiveKit may retain a disconnected participant object briefly for its own
resume grace period, which is not a returned call or a live microphone.

Physical Mac sleep/wake and Wi-Fi changes still need testing. The browser
expiry test uses a short dev-instance override, while the unit test advances
`Date.now()` across the shipped sixty-second threshold. Old pre-tab-id bundles
may require a reload after a gateway blip; no cookie-based fallback was added
because it would let sibling tabs resume one another's calls.
