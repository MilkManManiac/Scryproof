# Temporary comments on a stream

## Summary (write this last, for Wes, plain English)

_Empty until the build is done. Then: what you can do now, how to try it, the screenshots, what does not work yet, three things to try, check results, and whether it actually ran in a real call._

---

**Who this is for:** a builder working alone (Opus, a helper, or a cloud session). Wes will not answer questions. Never stop to ask. Make the call and log it under "Decisions I made" at the bottom.

**Phase:** first version of a new idea. Plain and working beats polished. No styling rounds.

## What and why

Wes's words, 2026-10-06:
- "Add a comment or que section where people watching/listening to a stream can post temp comments"

A small comment strip beside a screen share or a music share. Whoever is watching or listening can post a short comment; everyone watching that stream sees it; the sharer sees it. Comments vanish when the stream ends. Nothing is saved anywhere: not on the server, not in the browser.

"que" probably means "queue" (song requests while someone shares music). This spec builds comments only. Log "queue = song requests?" under Open problems for Wes; do not build a queue.

## The transport decision (researched 2026-10-06; Phase 0 proves it)

**Use LiveKit data messages, which this app already encrypts end to end.** Findings in `node_modules/livekit-client` (version **2.22.3**):
- `voice-session.ts` (line ~535) creates the room with `encryption: { keyProvider, worker }`, the newer option. In `setupE2EE()` the SDK sets `dataChannelEncryptionEnabled = !!this.options.encryption`, so data channel encryption is **on** for this room.
- `sendDataPacket()`: when `e2eeManager.isDataChannelEncryptionEnabled` (which also requires E2EE to be enabled), every `user` packet (what `publishData` sends, topic and payload included) is wrapped as `encryptedPacket` with AES-GCM under the sender's own call key. Data streams (`sendText`) also mark `Encryption_Type.GCM`.
- On receive, an `encryptedPacket` is decrypted with the sender identity's key; a failure is dropped. **But a plain, unencrypted `user` packet is still delivered**, with `encryptionType = NONE`. `RoomEvent.DataReceived` passes it as the fifth argument: `(payload, participant, kind, topic, encryptionType)`.

So: the server relays comments but cannot read them, and cannot forge one (it has no keys, and a packet relabelled to another sender fails to decrypt under that sender's key). The server does see who sent a packet, when, to which room, and its size.

Two rules make the "encrypted" label true:
1. **Receiver:** accept a comment only when `encryptionType === Encryption_Type.GCM`. Drop `NONE` silently.
2. **Sender:** send only when `room.isE2EEEnabled` is true; otherwise the SDK would send in the clear. If it is false, the input is disabled with "Comments need the call to be encrypted."

With both rules the strip may say **Encrypted**, under exactly the same condition the call's own label uses (`snapshot.encrypted`). Nowhere else.

Side finding for HANDOFF: Matt's music listeners (`web/src/lib/music-audience.ts`, topic `scryproof.music-listeners.v1`, sent with `publishData` in `voice-session.ts` ~line 957) are therefore also GCM-encrypted in transit, though the HANDOFF calls them "not end-to-end encrypted data". Its receiver does not check `encryptionType`. Do not change Matt's code in this build; note both points in HANDOFF after Phase 0 proves the packet is encrypted.

**If Phase 0 shows the packets are NOT encrypted** (SDK behaviour differs from the reading above), the order of fallbacks is:
- (b) encrypt the comment ourselves: AES-GCM with a subkey derived by HKDF from the call's current media key (`voice-crypto.ts`, per sender, info `"scryproof stream chat v1"`, epoch in the message), then send that ciphertext over `publishData`. May be labelled Encrypted.
- (c) the gateway (WebSocket): the server would see the text unless (b) is done on top; it is also a new server route with something to keep from logging. Only with (b) on top.
- (a) LiveKit data in the clear to the server: works, but must be labelled **"Not encrypted"** next to the input. Only if (b) cannot be done in the time limit, and log it as an Open problem.

## Ground rules

1. **Branch:** create `stream-chat` from `main`. Work and push only there. Never touch `main`, `oct6-feedback` or anyone else's branch. Never merge, never force-push. Push after every phase.
2. **No worktrees with junctioned `node_modules`** (PAPERCUTS 2026-10-04: it wiped `web/`, `server/`, `shared/`). Work in a plain checkout.
3. **Files you may create:** `web/src/lib/stream-chat.ts`, `web/src/lib/stream-chat.test.ts`, `web/src/components/StreamChat.tsx`, `docs/shots/stream-chat-*.png`.
   **Files you may edit:** `web/src/lib/voice-session.ts` (send, receive, clear; keep it to one small block near the music-audience code), `web/src/components/VoicePanel.tsx` (place the strip by a watched screen), `web/src/components/CallMixer.tsx` (place it by a music source and on the sharer's own music card), the stylesheet those components already use, `web/src/changelog.ts` (one What's new entry), `docs/HANDOFF.md`, this file. **No server files.** No new packages. No installer change (desktop gets it as a client update).
   Another builder may be working on `docs/SPEC-app-audio.md` (branch `app-audio`), which edits `music-share.ts`, `SharePicker.tsx` and the desktop shell. Do not touch those.
4. **Stuck rule:** two honest attempts, then write it under "Open problems", commit what works, move on if the next phase does not depend on it.
5. **Style:** match surrounding code and comments. No emoji. Plain short UI text. Comments render as plain text (React escaping); no markdown, no clickable links, no images.
6. **Never deploy.** Wes says when.

## Read first

- `CLAUDE.md` non-negotiables 2, 3 and 8: share content E2EE; server decides permissions; "encrypted" only where true.
- `web/src/lib/music-audience.ts`: the precedent. Topic string with a version, `readMusicAudience()` caps (payload over 4096 bytes rejected, at most 32 ids, ids must match `/^[A-Za-z0-9_-]{1,128}$/`), sender taken from the transport, never from the payload.
- `web/src/lib/voice-session.ts`: `publishData` for the audience (~957) and `room.on(RoomEvent.DataReceived, ...)` (~1794); how publications are tracked (search `MUSIC_TRACK`, `ScreenShareAudio`, `trackSid`).
- `web/src/lib/stream-watch.ts`: who is watching what. Screens only come down after pressing Watch; music after opting in.
- `web/src/components/VoicePanel.tsx` `VoiceStage` (~line 220): the tile grid, the focused tile with a strip under it, the Watch card (~279-349).
- `web/src/components/CallMixer.tsx`: music sources, listener avatars, the sharer's Music together card.
- (`web/src/components/Stage.tsx` is the hopping characters overlay, not the call stage. Ignore it.)

## The design

**Message** on topic `scryproof.stream-chat.v1`, reliable, sent to the whole room with `publishData`:
`{ "stream": "<publication trackSid>", "id": "<16 hex chars, random>", "text": "<comment>" }`

**`readStreamComment(bytes)`** in `stream-chat.ts`, pure and tested, in the style of `readMusicAudience`:
- payload at most 2048 bytes, valid JSON, exactly these three string fields
- `stream` matches `/^[A-Za-z0-9_-]{1,128}$/`, `id` matches `/^[0-9a-f]{16}$/`
- `text` trimmed, 1 to 300 characters, newlines and tabs collapsed to spaces, any other control character rejected
- returns null on anything else

**Receiving** (in `voice-session.ts`): drop unless topic matches, `encryptionType === GCM`, the sender `participant` exists, and `stream` is a currently published screen share (`ScreenShare`) or music (`ScreenShareAudio` named `MUSIC_TRACK`) publication of some participant in this room. Sender id and name come from `participant.identity`, never the payload. Duplicate `id` from the same sender is ignored.

**Limits** (dials, as named constants at the top of `stream-chat.ts`):
- `MAX_LENGTH = 300` characters
- sender side: at most 1 comment a second, 5 per 10 seconds; the send button greys out briefly
- receiver side: the same limit per sender; extras dropped silently (a modified client cannot flood others)
- `KEEP = 50` newest comments per stream in memory; older ones fall off

**Who sees what:**
- Every person in the call receives the packet (they hold the call keys anyway). The strip is drawn only for someone who is watching that screen (pressed Watch) or listening to that music (opted in), and always for the sharer on their own share.
- Late joiners and people who press Watch later start with an empty strip. No history is sent. (Decision you can overrule; a "send me the last 20" request like music-audience's would be the next step.)
- Comments are cleared when: the publication unpublishes (stream ended), the person leaves the call, the room changes. A restarted share is a new `trackSid`, so its strip starts empty.
- Nothing is written to localStorage, IndexedDB, the server, or logs. No notifications, no unread badges.

**Permissions:** anyone in the call may comment; being in the call is already the server's decision (token issued by `server/src/routes/voice.ts`; timed-out users get no token). The server can read none of it, so it cannot filter text. A server-side mute for comments would mean issuing tokens with `canPublishData: false` (`server/src/services/livekit.ts` sets it `true` for everyone), which would also silence music presence. Not in this build; log under Open problems. A moderator-hidden or server-muted person: the client hides their input (client only hides buttons; the honest limit goes in the summary).

**UI (`StreamChat.tsx`):**
- Screen share: a 260 px column on the right of the focused screen tile, collapsible with a small button; under 700 px wide it sits under the tile at about 160 px tall. Not shown in grid view tiles, only on the focused stream.
- Music: a compact list under that music source in the mixer, and on the sharer's Music together card.
- Each line: avatar initial or picture (existing `Avatar`), name, text. Newest at the bottom, auto-scroll unless the reader scrolled up.
- Input: one line, placeholder `Say something`, Enter sends, counter appears past 250 characters. A small lock and the word `Encrypted` when the rules above hold.
- Empty state: `Comments disappear when the stream ends.`

## Phases (each ends runnable, with one check and a push)

**Phase 0: baseline and proof of encryption.** `npm run typecheck`, `npm test --workspace web` (record counts; PAPERCUTS: one web test is timing-flaky, keep full output if it fails). Start `npm run dev:livekit` and `npm run dev`. In a two-browser local call, send one `publishData` on the new topic from the console (or `window.__voice` if exposed) and log the receiver's `encryptionType`.
Check: the receiver logs `GCM` (enum value 1). Also confirm with a third participant whose key is wrong (the wrong-key path `scripts/mixer-check.mjs` uses) that the message never reaches `DataReceived`. If either fails, switch to fallback (b) above and say so in Decisions.

**Phase 1: the pure module.** `stream-chat.ts`: `readStreamComment`, the rate limiter, the per-stream store (add, cap at `KEEP`, clear by stream, clear all).
Check: `stream-chat.test.ts` covers oversize, bad fields, 301 characters, control characters, duplicate id, rate limit, cap at 50, clear on end. `npm test --workspace web` passes.

**Phase 2: wired into the call.** Send/receive/clear in `voice-session.ts`, comments exposed in the snapshot by stream sid.
Check: two browsers in a local call, one shares a screen, the other watches; a comment typed in the console API appears in the other's snapshot; stopping the share empties it.

**Phase 3: the strip on a screen share.** `StreamChat.tsx` beside the focused screen.
Check: two browsers, comments both ways, the sharer sees them. Screenshots `docs/shots/stream-chat-screen.png` (desktop width) and `stream-chat-mobile.png` (390 px). Stop the share: the strip is gone and rejoining shows nothing old.

**Phase 4: the strip on music.** Under the music source in `CallMixer.tsx` and on the sharer's card.
Check: share music from a tab, listener opts in and comments, sharer sees it. Screenshot `docs/shots/stream-chat-music.png`.

**Phase 5: What's new and HANDOFF.** One What's new entry dated the release day. HANDOFF section with the encryption finding about music listeners.

Full checks once at the end: `npm run typecheck`, `npm test`. Zero console errors during the Phase 3 and 4 runs.

**Must never happen:** a comment saved anywhere; a comment shown that arrived with `encryptionType` NONE while the strip says Encrypted; the word Encrypted shown when `room.isE2EEEnabled` is false; a sender name taken from the payload; any server file changed.

**Stop rule:** stop after Phase 5, or at 2 hours. Then write the summary at the top.

## Decisions I made

## Open problems

- "que": Wes may have meant a song-request queue for music shares. Ask him.
