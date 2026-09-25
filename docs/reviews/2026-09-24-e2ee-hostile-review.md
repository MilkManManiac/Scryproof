# Scryproof end-to-end encryption: hostile-server review

2026-09-24. Source review of `main` at `2cf3edf`. Nothing touched scryproof.com or the box.

**Who looked.** Claude (Opus 5.5), and two independent reviewers from other model families working from the same brief: GPT Astra at xhigh effort, and GLM 5.3 at max effort. A third seat (Grok) failed on billing. Every finding below was checked against the code by Claude; the reviewers' reports were treated as claims, not evidence. The three found different things: only Astra found findings 3 and 4, only Claude found finding 6, and all three found finding 2. Each finding says who found it.

**Red tests.** Branch `review/crypto-red-tests` (local, commit `8f917b8`) adds seven tests: five fail today, one per attack, and two controls pass. Run `npm test` in `web/`. The whole web suite reads 294/299, and the five failures are exactly these tests. Each was red-proofed: with a minimal temporary fix in place it went green, and the fix was then removed.

## Verdict

Against a server that only leaks (a stolen database, a backup, a disk image), the encryption holds: nothing stored on the box decrypts anything, and no reviewer found a way around that. Against a server that actively lies, the desktop app, the one client meant to survive that, loses in several independent ways. None of them breaks the cryptography; all of them come from the client believing the server about *who* is in a conversation and *what state* it is in. For browser users these attacks add little, since a lying server can already send them poisoned JavaScript (GAMEPLAN finding 2), but they are the whole question for desktop users. The update signing that protects the desktop app is sound; its weak point is the first install.

## Findings, most severe first

### 1. The voice verification code can be made to match with the server in the middle — critical

*Confirmed from code; red test. Found by Astra and GLM; verified by Claude. GLM rated it low, reasoning that the other person's pins would flag the swapped key. That holds only for people who have already met: on a first call nobody has pins, and the red test shows the codes match.*

The voice panel tells people: "If everyone in the call sees the same twenty digits, nobody is in the middle, including this server" (`VoicePanel.tsx:698`). That promise holds only if each device puts its own real key into the code. It doesn't.

`VoiceCall.admit` gives any correctly self-signed announcement that claims this device's own user and device id the verdict `'known'`, with no check that the key is this device's key (`voice-crypto.ts:644-646`), and stores it over this device's own seat. `verificationCode()` then reads that seat back from the map (`voice-crypto.ts:806-812`). The session layer accepts such an announcement as long as the server labels it as coming from that user (`voice-session.ts:1108-1115`; the server fills in `from`).

The attack, on a first call between Alice and Bob:

1. The server makes two keys of its own, A′ and B′.
2. It gives Alice B′ as "Bob's device" (first sight, so trusted) and A′ as "Alice's own device". It gives Bob the mirror image.
3. Alice's media key is wrapped to B′, so the server has it. The server re-wraps it from A′ to Bob's real key; Bob accepts it and decrypts Alice's audio directly. The same happens in reverse.
4. Both devices compute the code over {A′, B′}. In the red test both read `72058 30300 72756 09492`.

The 600k-iteration PBKDF2 and the twenty digits do not help, because the attacker is not searching for a collision. It makes the inputs identical. And because the substituted keys are pinned, every later call stays quiet as long as the server keeps it up.

**Fix:** in `admit`, reject an announcement for this device's own seat unless its fingerprint equals `this.identity.fingerprint`, and build the code's own entry from `this.identity`, not from the map. Two lines; the red-proof used exactly this and all 36 existing voice tests still passed.

**Why this one matters beyond voice:** voice uses the same identity key and the same pin table as DMs and encrypted channels (`voice-session.ts:394, 403`; `this-device.ts`). Once this is fixed, two people who read the code aloud in a call also confirm the keys their DMs and channels use. A first-contact man-in-the-middle in DMs would show up as a mismatch. Today that is the only verification ceremony in the app, and this bug disables it.

**Tests:** `web/src/tests/review-voice-self-seat.test.ts`.

### 2. A server-invented person silently receives DMs and every channel key, history included — critical

*Confirmed from code; red test for channels. Found independently by Claude, Astra and GLM.*

Three facts combine:

- **First sight is trust.** When a user has no pinned devices, every device the server lists for them is marked `first-seen` and trusted (`dm-crypto.ts:235-251`). It is also pinned at that moment (`dm-crypto.ts:249`), so the next time it reads as `known`. From then on it cannot be told apart from a person someone actually accepted.
- **DMs send to whatever devices the server lists.** `seal` wraps the message key for every trusted device in the list (`state/dms.tsx:737`) and never checks that the device belongs to someone in the conversation. The server can add a stranger's device to a two-person DM, and the header still shows two people. (The honest server filters to members, at `server/src/routes/dms.ts:568-575`; the client does not re-check.)
- **Channels hand out every old key on request.** When the server says "keys wanted" over the gateway, `handOut` gives every epoch key this device holds to every listed device it trusts (`channel-keys.ts:271-298`). Its own comment says "Devices nobody here has accepted are skipped"; first-seen devices are nobody's acceptance, and are not skipped.

**The removed-member variant (GLM).** When Mara leaves a group DM, the server can keep listing her device. Everyone already accepted it while she was in, so it reads as `known`, and every sender keeps wrapping every new message for her. The honest server refuses exactly this (`server/src/routes/dms.ts:334-337`: "A key was addressed to someone outside this conversation"), but that check runs on the party being defended against. The channel version works the same way: `makeEpoch` seals to the server's `readers` list (`channel-keys.ts:240-263`).

The channel design doc accepts that a hostile server could add a person, and says they "would be visible in the channel's 'who holds the key' list." That list comes from the server: `holders()` reads `state.holders` and `readers`, both server-supplied (`channel-keys.ts:472-485`). The server can hand out the keys and leave the person off the list. The DM case is worse than anything documented, because the extra recipient need not be a member of the conversation at all.

**Fix:** for DMs, filter recipients to `dm.members` (one line), and warn when the device list and the member list disagree. This makes a hidden recipient visible; it does not stop a server that also lies about membership, which is what the next step is for. For both DMs and channels, separate "seen before", which is worth pinning to catch a key change later, from "a person here accepted this", which should be required before any key is released. A vouch from an accepted device should also count. The red-proof showed that simply not pinning on first sight breaks three existing TOFU tests in `dm-crypto.test.ts`, so this needs a design decision, not just a one-line patch. Record locally which devices this client actually handed keys to, and show that list instead of the server's.

**Tests:** `web/src/tests/review-channel-keys.test.ts`: the control, plus "a device of someone alice has never met gets no key until a person here accepts it". The test asks twice, so a fix that forgets the pin-on-first-sight trap still fails. There is no DM red test yet: `seal` lives inside the React provider, so the test comes naturally with the fix, once recipient choice is pulled out into a function.

### 3. The server can switch an encrypted channel back to plaintext — high

*Confirmed from code. Found by Astra, verified by Claude.*

A `channel_update` event replaces the whole channel object (`state/store.tsx:658-667`), and the composer decides whether to encrypt from `channel.encrypted` alone (`Composer.tsx:274` for text, `346` for files). The server sends `encrypted: false`, the lock icon disappears, and the next message and upload go up in plaintext. The rule that encryption is irreversible exists only on the server (`server/src/routes/messages.ts`), which is the party it needs to protect against.

**Fix:** once this device has seen a channel encrypted, remember it locally (IndexedDB, so it survives restarts), and refuse to send in plaintext to that channel. If the server says otherwise, show a blocking error.

### 4. The server can put words in anyone's mouth in an encrypted channel — high

*Confirmed from code; red test for the second path. Found by Astra, verified by Claude.*

There are two separate paths.

- **Plaintext injection.** Messages are only opened and checked when they carry ciphertext (`store.tsx:1137`; `channel-keys.ts:346`). The server can send a plain `content` message in an encrypted channel under any member's name. It renders like any other message, and the only boundary marker is a line placed by a server-supplied timestamp.
- **Cache re-attribution.** An opened message is cached by id and signature (`channel-keys.ts:351`). When the server re-sends a message with the same id and signature but a different author, the cached text is shown under the new author, still marked verified. The doc says the signature covers the author, and the cache skips that check.

**Fix:** in a channel this device knows is encrypted, show plaintext only if it predates the switch, and judge that by something the server can't move; otherwise show it as unverified. Key the cache on the full verified frame (author, device, channel, epoch, reply, mentions), not just the signature.

**Tests:** "a verified message moved to another author is not shown as verified".

### 5. The server can roll a channel back to a key a removed member still holds — medium

*Confirmed from code; red test. Found by Astra and GLM; verified by Claude.*

`sendKey` seals under whatever epoch the server calls `current` (`channel-keys.ts:213-237`), with no check that it only moves forward. After Mallory is removed and epoch 2 exists, the server can say `current: 1` again, and Alice's next message is sealed under a key Mallory kept. Against a lying server, finding 2 already covers this ground, since the server can simply keep Mallory as a reader. This version needs no other client online to hand anything out. An even simpler variant (GLM): rotation after a removal is triggered by server code (`server/src/services/channel-keys.ts:50-79`), so a lying server just never rotates, and the doc's "the person who left … gets nothing after" holds only as long as the server is honest. Voice already clamps its epoch to move only forward; channels don't.

**Fix:** remember the highest epoch this device has sent under, per channel, and refuse to go below it.

**Tests:** "a server cannot move alice back to an older key once she has sent under a newer one".

### 6. The first desktop install trusts the server completely — medium, one-time per install

*Confirmed from code and docs. Found by Claude.*

GAMEPLAN line 78 says that with signed updates, "owning the server does not let anyone change the code members run." That holds for an app that is already installed. The installer itself is served by the box (`server/src/routes/downloads.ts`, nginx `location /download/`), and it isn't Windows code-signed (HANDOFF line 251: code signing costs money; SmartScreen warns). A lying server can hand a new member, or anyone reinstalling, a modified installer. That installer carries its own update key, so every later "signed update" is the attacker's too.

**Fix, cheapest first:** publish the installer's SHA-256 and the update key's fingerprint somewhere the box doesn't control, such as the GitHub release notes or a pinned message Wes sends by hand, and say to check it. Code-sign when that becomes worth the money.

### 7. Nobody can actually do the out-loud check the DM warning asks for — medium

*Confirmed from code. Found by Claude and GLM (which rated it high).*

The DM device warning shows 16 hex characters of a fingerprint (64 bits) and says it "can be compared out loud" (`DirectMessages.tsx:440-475`). No screen shows people their *own* fingerprint, so the other person has nothing to read back. Trusted devices are never shown at all. And since first meetings, new desktop installs and fresh accounts are all trusted on first sight (finding 2), the window a server needs reopens constantly. Voice has a real verification ceremony (once finding 1 is fixed); DMs and channels have none.

**Fix:** fixing finding 1 comes first, since it restores the voice code as a check on the shared keys. Then build the safety number already planned as stage 4 of `docs/dm-plan.md`: a per-conversation code built like the voice code, shown in the DM header and the channel lock panel, plus a screen where people can see their own fingerprint.

### 8. Smaller items — low

- **DM reactions skip the trust check.** `toReaction` rejects only `invalid` devices (`state/dms.tsx:446-456`), so a reaction from an unaccepted device shows with no "unverified" mark.
- **DMs can be replayed and reordered** (Claude and GLM; GLM rated it medium). The DM seal binds the conversation, author and device (`dm-crypto.ts:625`), but not a message id, a time, or an order, so the server can show an old "yes" as new, or put "no" before "yes". The channel doc states this limit for channels; the DM docs don't state it for DMs. Fix: a sender timestamp and counter inside the sealed body.
- **Old-format group messages can still be sent today.** Messages that only open the old (v1) way are tagged "sender not proven" (`state/dms.tsx:436`, `DirectMessages.tsx:906-912`), which is right. But the tooltip says the message was "Sent before group messages were tied to their sender", and a member can still send one now. The tag should say "could have been written by anyone in this group", without the "before".
- **One identity per browser, not per account.** The identity and DM keys are stored under `'self'` (`voice-identity.ts:84,128`). Two accounts signed in on the same browser share one device key.
- **Desktop hardening, no live hole found.** The desktop app proxies `app://scryproof/api/*` to the server and returns the server's response headers as they are (`desktop/src/main.js:177-201`), and the CSP's `script-src 'self'` covers those URLs. Anything that ever navigates to, frames, or loads a script from `/api/` would run server-chosen code inside the origin that holds the keys. Today, links go out through the window-open handler (`https:` only), and attachments use `download`, so no trigger was found. **Fix:** give forwarded responses a `Content-Security-Policy: sandbox; default-src 'none'` header and `nosniff`, and refuse navigation to `/api/` in `will-navigate`.

## Checked and sound

- **Passive storage.** The server stores ciphertext, wrapped keys, commitments and public keys; no private key or plaintext of encrypted content (`server/src/db/schema.ts`; Astra and Claude).
- **Primitives.** Keys come from `crypto.getRandomValues`: 32-byte content keys and 12-byte AES-GCM IVs, and no nonce reuse was found. HKDF infos and AES-GCM additional data bind the stated context, sender, recipient and conversation (`dm-crypto.ts`, `channel-crypto.ts`, `voice-crypto.ts`).
- **Private keys are non-extractable** WebCrypto handles, including recovery keys. This is an API restriction, not hardware protection against a compromised machine.
- **The group-DM sender forgery is fixed.** v2 wraps bind the body's IV and ciphertext hash (`dm-crypto.ts:463-476`), and the existing attack test passes. (See the low item on old-format messages.)
- **Vouching** binds user, endorser, device and key, can't bootstrap from an untrusted cycle, and can't rescue a changed key (`dm-crypto.ts:165-195, 258-269`).
- **The recovery phrase** has 128 bits of entropy (BIP39) and separates accounts and purposes; a stolen database gives no practical offline search.
- **Voice, apart from finding 1.** Per-sender keys are rotated on every join and leave, unsigned strangers are dropped, a changed key is held until approved, and the room is built with E2EE and switched on (`voice-session.ts:410, 430`), with no plaintext fallback found.
- **Desktop update signing.** Client bundles and installers each need Ed25519 signatures over domain-separated version-and-hash strings (`update-core.js`, `installer-core.js`), and each is re-verified before use. Updates are forward-only, and a stored update is re-checked from scratch at start. Updates are served from memory after the check, bundle paths are sanitized, and installers are re-hashed right before running. The page can only choose *when* to apply an update; it has no say in *what* is applied. An installed copy exits if started with a remote-debugging or inspect switch (`main.js:122-125`). The checked-in client bundle verifies against the bundled key (Astra).
- **Desktop window.** `contextIsolation`, `sandbox`, no `nodeIntegration`, webviews refused, `window.open` denied (web links go to the real browser), IPC answered only for the app's own origin, and permissions granted only to the app's origin.

## Not checked

- Nothing was run against scryproof.com or the box, and no Electron or LiveKit integration test was run.
- The server's own route authorization, which is next week's planned audit (BUILD-ORDER).
- Whether the installed desktop builds match this source, and custody of Wes's signing key.
- Dependency-level crypto (`@noble/curves`, `@scure/bip39`, LiveKit's frame encryption).
- DM and channel file-attachment encryption beyond the seal and open helpers.

## Suggested order

1. Finding 1 (voice self-seat): two lines, with a red test waiting.
2. Finding 2's DM half (filter recipients to members): one line.
3. Finding 3 (remember encrypted channels locally): small.
4. Finding 4's cache key, and finding 5's forward-only epoch: small, with red tests waiting.
5. Finding 2's real fix ("seen" versus "accepted"): a design choice for Wes; it changes how newcomers get into encrypted channels.
6. Finding 6: publish the installer hash off-box before the next person installs.
