# Temporary comments on a stream

## Summary (write this last, for Wes, plain English)

Built 2026-10-19, all five phases, in the main checkout (not committed; the lead reviews and commits). Not deployed.

**What you can do now.** When you watch someone's screen big, a Comments column sits on the right of it. Type, press Enter, and everyone watching that screen sees it, and so does the person sharing. The person sharing sees a "Comments on your screen" box under the call grid without having to do anything. A screen you pop out into its own window has the same column beside it, and you can type there too. When someone shares music, the same comments sit under their music in the mixer once you press Listen, and on the sharer's own Music together card. Comments vanish when the stream stops; someone who joins the call later starts with an empty box.

**Is it private.** Yes, and more than the plan expected. The plan was to lean on LiveKit's own encryption of these messages. The first check showed LiveKit does encrypt them, but on the receiving side it labels every one of them "not encrypted", so the app could not tell a real comment from one the server made up. So each comment is now locked again with the sender's own call key before it leaves, and a comment that does not unlock under the sender's key is thrown away. Tested: a person holding the wrong key never sees it, and a plain fake comment shows for nobody. The server sees who sent something, when, and how big, but not the words.

**Screenshots** (docs/shots): `stream-chat-screen.png` (watcher, desktop), `stream-chat-sharer.png` (the sharer's box under the grid), `stream-chat-mobile.png` (390 px phone: the column goes under the picture), `stream-chat-popout.png` (popped-out window), `stream-chat-music.png` (listener in the mixer), `stream-chat-music-sharer.png` (sharer's Music together card).

**Three things to try.**
1. Share your screen to Trey, have him press Watch and type something. It shows in the box under your grid.
2. Have him press Pop out and type from the popped-out window.
3. Share music, have him press Listen in the mixer and comment; stop the music and watch the comments go.

**What does not work yet.** No history for late joiners (by design for now). No way for a moderator to stop someone commenting other than a server mute (which hides the box on that person's own screen only; see Open problems). "que" (a song-request queue?) is not built. Comments are not drawn on grid tiles, only on the big screen, the sharer's box and the mixer.

**Checks.** All run against the local dev servers in real two- and three-browser encrypted calls (headless Chrome, fake camera and screen, driven over DevTools the same way `scripts/voice-check.mjs` is):
- Phase 0: FAIL as written, which changed the plan. Receiver logged `encryptionType` 0 (NONE), not GCM, for a packet that was in fact encrypted (Mara with a wrong key got "DataCryptor decryption failed" and never saw it). Switched to fallback (b).
- Phase 1: 6 new unit tests; web suite 579/579.
- Phase 2: PASS, 16 of 16 checks: comment from the console API lands in the sharer's snapshot; the wrong key never shows it; a plain unsealed packet shows for nobody; too-quick second comment refused; nothing in localStorage; stopping the share empties every snapshot; no console errors.
- Phase 3: PASS, 25 of 25 checks: strip beside the big screen with "Encrypted" and the empty-state line; comments both ways through the real input and Send; sharer sees them; pop-out shows the same comments, is styled, and can send; stopping the share removes the strip for both; a restarted share is a new stream and starts empty; no console errors.
- Phase 4: PASS, 16 of 16 checks: no strip before Listen; strip under the source after Listen; strip on the sharer's card; comments both ways; stopping the music empties both; no console errors. (The music capture was Chrome's fake one; what was tested is the comments, not the sound.)
- Full: `npm run typecheck` clean; `npm test --workspace web` 579 pass, 0 fail (573 before this build).

Not yet tried by real people on two real PCs, and not tried in the desktop app's pop-out window (it should work the same, since the page draws into it; worth one look).

**For HANDOFF (the lead writes it):**
- Stream chat built (this spec). Topic `scryproof.stream-chat.v1`, payload sealed with AES-GCM under HKDF(sender's media key, salt = call id, info "scryproof stream chat v1"), additional data = [call id, sender, epoch]. Code: `web/src/lib/stream-chat.ts`, block "stream comments" in `voice-session.ts`, `web/src/components/StreamChat.tsx`.
- Finding about LiveKit data messages (livekit-client 2.22.3): with `encryption` set on the room, `publishData` payloads ARE encrypted in transit with the sender's call key (proved: a wrong key drops them). But the receiver's `encryptionType` is always NONE, because the SDK reads it from `EncryptedPacket.encryptionType`, which its own sender never sets. So nothing in the app can tell an encrypted data packet from a plain one by that argument. Consequences for Matt's music listeners (`music-audience.ts`): the presence packets are encrypted in transit (HANDOFF calls them "not end-to-end encrypted data"; that is too pessimistic for honest senders), but the receiver also accepts a plain packet the server could forge, so "the server cannot fake who is listening" is not true today. Not changed in this build. Fix, if wanted: seal them the way stream chat does.
- Check harness for this build: `scripts/stream-chat-check.mjs`; run `node scripts/stream-chat-check.mjs 0|2|3|4` with the dev servers up.

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

- **Fallback (b), because Phase 0 failed.** `encryptionType` arrives as NONE for encrypted packets (SDK reads it from a field its sender never sets), so rule 1 ("accept only GCM") would have dropped every comment, and accepting NONE would accept forgeries. Each comment is sealed by us (AES-GCM, key from HKDF over the sender's current media key, salt = call id, info `scryproof stream chat v1`; additional data binds call id, sender identity and epoch). The receiver picks the key by the sender identity LiveKit reports; anything that does not open is dropped. Wire format: `{ epoch, iv, box }`, at most 4096 bytes; inside the box, exactly the spec's `{ stream, id, text }`, checked by `readStreamComment`. Rule 2 is kept: nothing is sent unless `room.isE2EEEnabled`; "Encrypted" shows exactly when `snapshot.encrypted`.
- **The test file lives in `web/src/tests/stream-chat.test.ts`**, not `web/src/lib/`, because the web test command only runs `src/tests/**/*.test.ts`.
- **Receiver rate limit is a little looser than the sender's**: 5 per 9 s with at least 0.5 s between, against the sender's 5 per 10 s and 1 s. The same numbers on both ends would drop honest comments that the network bunched together.
- **Text cleaning**: newlines and tabs, with the spaces around them, become one space. Direction-override characters (U+202A to U+202E, U+2066 to U+2069, U+200E, U+200F) are refused along with control characters, so a line cannot be made to read backwards. Length counts characters (code points), so 300 emoji fit.
- **The sharer gets a box without making their own screen big**: "Comments on your screen" under the grid. Otherwise the person sharing would never see comments unless they clicked their own tile.
- **Pop-out**: the popped-out window gets copies of the page's stylesheets and theme, and draws the same column beside a screen (not beside a camera). Small change to `PopOut.tsx`, which was not on the spec's list but the 2026-10-19 addition asked for it.
- **Everyone in the call receives and keeps comments** for screens they are not watching (they hold the keys anyway); the box is only drawn for a watcher, a listener or the sharer. So pressing Watch mid-stream shows comments made before, from this device's memory. **This differs from the spec** ("people who press Watch later start with an empty strip"); hiding them would also hide comments a viewer already read whenever the big screen is switched back to the grid and again. Someone who joins the call later starts empty. Easy to flip if Wes wants it the spec's way.
- **When someone leaves**, their comments stay on streams that are still going; their own streams end and take their comments with them. When you leave, everything goes.
- **A moderator-muted person** (`serverMute`) sees "A moderator has muted you." instead of the input. Client only; see Open problems.
- **Comments in flight across a key change are lost.** A comment sealed under epoch N that arrives after the receiver moved to N+1 (someone joined or left at that moment) is dropped, the same way media frames are.
- **The phone strip is 200 px tall**, not 160: at 160 the header and input left room for about one line.
- **What's new** entry is dated 2026-10-19 under its own id, above the YouTube entry. If both ship together the lead may merge them.

## Open problems

- "que": Wes may have meant a song-request queue for music shares. Ask him.
- **Moderation is client-only.** A server-muted person's box is hidden on their own screen, but a modified client can still send comments. Stopping that needs tokens with `canPublishData: false` (`server/src/services/livekit.ts`), which would also stop music presence. Not built.
- **Matt's music listeners accept unencrypted packets** (see the HANDOFF note in the summary). The server could fake who is listening. Fix: seal them like stream chat. Not touched here.
- **Desktop app pop-out not tried.** The desktop app opens pop-out windows through `desktop/src/main.js` (streamWindow); the page draws into them the same way, and the stylesheet copy uses absolute URLs, so it should work, but nobody has looked.
- **No history for late watchers or joiners.** A "send me the last 20" request, like music presence's `request`, would be the next step.
- **Not run between two real PCs yet.** All checks were local headless browsers.
- **The check script is not in the repo.** It was kept out because the spec did not list it; the lead has the path.
