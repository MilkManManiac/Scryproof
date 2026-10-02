# Mac desktop: six spikes before we plan

For the agent on Trey's Mac. Written 2026-10-02 by Fable (devbox) after
reviewing `docs/reviews/2026-10-02-desktop-port-assessment.md` against the
code. Trey's ruling: **Mac only.** Matt owns Linux. Windows keeps shipping as
it does today. Nothing here touches Wes's server; nothing here is a deploy.

The point is clarity, not a port. Each spike answers one question with
evidence. Report findings in the `scryproof-mac` post channel as you go, one
message per spike, and write the results back into this file under each
spike's **Result** heading. Hold off on fixing things you find unless the fix
is the spike (spikes 2 and 5 each need a few lines of code).

## Setup

- Checkout: `git pull origin spike/mac-desktop` (origin is Forgejo). Work on
  this branch. Commit evidence and tiny code changes here; push to origin
  freely. Never push to the `github` remote.
- Build the client, then the app: `npm ci && npm run build --workspace web`,
  then `cd desktop && npm ci`.
- **A packaged build talks to `https://scryproof.com`, hard-coded**
  (`desktop/src/main.js`, `SERVER`). That is Wes's live server. Trey has an
  account; sign in as him. Do not create accounts, servers, or channels
  there beyond what a call test needs; ask Trey in the channel first.
- Second participant for call tests: Chrome on the same Mac, signed in as
  the same account on a different device, is enough for packet counting.
  Someone on Windows is better for the audio-exclusion check in spike 2.
- The connection panel in a call shows RTT, jitter, loss, TURN, and per-
  person audio packet and video frame counters. Those counters are the
  instrument. "I heard it" is not evidence; "packets received climbed from
  0 to 1,400 over 10 s while the window played sound" is.
- Record the Mac: model, chip, macOS version. Everything below assumes
  macOS 15.

## Spike 1 — Package it and make a call

**Question.** Does the existing app run on darwin unchanged: trust boundary
(`app://scryproof` origin, cookie jar, forwarder, gateway) and an encrypted
call?

**Do.**
1. `cd desktop && npx electron-builder --mac dir --arm64 --publish never`
   (add `"mac": { "target": "dir" }` to `build` in `desktop/package.json`
   if the CLI flags alone do not take). No signing config. Expect an
   `.app` under `desktop/release/mac-arm64/`.
2. Open it from Finder. Note every prompt (Gatekeeper, Keychain, microphone,
   screen recording). Screenshot each.
3. Sign in, open a server, join a voice channel with the second participant.
   Confirm the connection panel says encrypted and the audio packet counter
   climbs both ways.
4. Quit and relaunch. Note whether the Keychain prompt returns (the
   cookie-encryption fuse uses the Mac Keychain; unsigned Electron apps
   are known to re-prompt after every rebuild).
5. Look at the menu bar: the tray icon is a color PNG, and Mac wants a
   monochrome template image. Screenshot how it looks in light and dark.

**Record.** Each prompt, the connection panel screenshot, whether the app
launched from asar without complaint, the icon.

**Result.**

## Spike 2 — Share with sound through Apple's picker

**Question.** Does share-with-sound exist on Mac at all? Astro's assessment
says Electron documents Mac system audio. The current Electron docs say the
loopback audio option our custom picker uses "is currently only supported on
Windows." The only Mac route is `useSystemPicker: true`, macOS 15+,
experimental. This decides whether our custom picker survives on Mac.

**Do.**
1. In `desktop/src/main.js`, where `setDisplayMediaRequestHandler` is
   called (around line 445), on `process.platform === 'darwin'` pass the
   handler with `{ useSystemPicker: true }`. Keep the custom picker on
   other platforms. Rebuild the dir target.
2. Grant Screen Recording in System Settings when asked (will need a
   relaunch).
3. Start a share of a window that plays a distinct sound (a YouTube tab
   with music). Tick system audio in Apple's picker if offered.
4. On the second participant, read the screen-share audio packet counter.
   Does it climb? Then, with a third sound source (the call itself, a
   person talking), does the share carry the call's own voices back?
   `restrictOwnAudio: true` is already requested by the client
   (`web/src/lib/voice-session.ts`, `setScreenShare`); we want to know if
   darwin honors it.
5. Also try the custom picker unchanged (no `useSystemPicker`) and confirm
   it offers no sound switch on Mac, which is what `share-menu.js`
   predicts.

**Record.** Whether Apple's picker appears, whether it offers audio,
received audio packets with and without the audio tick, whether call audio
leaks into the share, and what the custom picker looks like on Mac.

**Result.**

## Spike 3 — Push-to-talk behind another app

**Question.** Does the global keyboard hook (`uiohook-napi`) load from the
packaged app on darwin, which permission does macOS demand, and does a
held key survive the app being in the background?

**Do.**
1. In the packaged app, join a voice channel, choose push-to-talk, pick a
   key. Note the macOS permission prompt: Accessibility, Input Monitoring,
   or neither. Grant it, relaunch if required.
2. Bring a full-screen app to the front (a game if you have one, otherwise
   a full-screen Chrome window). Hold the key, speak, release. The second
   participant reads the audio packet counter: climbs while held, flat
   after release.
3. Hold the key, Cmd-Tab away from everything, release. Does the app see
   the release? (Astro flagged lost releases; this is the test.)
4. Check `desktop/release/mac-arm64/Scryproof.app/Contents/Resources/`
   for `app.asar.unpacked/node_modules/uiohook-napi/` — electron-builder
   should unpack the native module automatically. If push-to-talk silently
   does nothing, this is the first place to look.
5. Check Console.app for anything the hook logged.

**Record.** The permission name, whether the hook loaded, packet counters
during hold and after release, and the Cmd-Tab release case.

**Result.**

## Spike 4 — What a friend sees opening an unsigned build

**Question.** Is an unsigned build viable for a small friend group, or is an
Apple Developer account (notarization) a day-one requirement?

**Do.**
1. Zip the `.app` from spike 1. Copy it to a fresh macOS user account on
   the same Mac (or a second Mac if handy). Download it through a browser
   so it carries the quarantine flag, the way a friend's download would.
2. Double-click. Record the exact dialogs and the exact clicks needed to
   get it open on macOS 15 ("Open Anyway" lives in System Settings >
   Privacy & Security). Count the steps. Screenshot each.
3. Relaunch once approved: does it stay approved?

**Record.** Step count, screenshots, whether approval sticks. Do not try to
sign or notarize; that is a decision for Trey and Wes.

**Result.**

## Spike 5 — Client self-update, dev mode only

**Question.** Is the signed client updater truly platform-independent? If
yes, the Mac app gets code updates from day one and we can skip Mac shell
updates entirely (shell updates on Mac mean replacing the app bundle under
Gatekeeper, a much bigger job than the Windows installer path).

**Do.**
1. Read the header of `desktop/src/update-core.js` and `main.js`'s
   update section. The updater fetches `client.json` and `client.bin` from
   `UPDATE_URL`, verifies an Ed25519 signature, and reloads.
2. Do this in **dev mode**, not packaged: `SCRYPROOF_SERVER=<local or
   live>`, `SCRYPROOF_UPDATE_URL=http://127.0.0.1:<port>/` served from a
   local folder, `SCRYPROOF_UPDATE_EVERY_MS=10000`. Make a test bundle
   with `desktop/scripts/make-update.mjs` against a throwaway signing key
   (`desktop/scripts/signing-key.mjs` makes one; point the app at its
   public half only for this run, never commit a key). Bump the version,
   serve it, watch the app pick it up and reload.
3. **Do not** publish anything to `scryproof.com`. Wes gates deploys.

**Record.** Whether the dev-mode update applied on darwin and reloaded into
the new client, and any darwin-specific failure in the file write or
reload path.

**Result.**

## Spike 6 — Close the lid mid-call

**Question.** Does a call recover from sleep, or do we hit the known bug
where a lost media connection marks the session failed and clicking the
same call again returns early (`voice-session.ts`, the `Disconnected`
handler sets `phase: 'failed'`; `store.tsx`, `joinCall` returns when the
place matches `currentCall`)?

**Do.**
1. In a call, close the lid. Wait two minutes. Open it.
2. Record what the connection panel says, whether audio resumes, and if
   not, whether clicking the same voice channel does anything.
3. Also: close the window (red button) mid-call. Does audio keep flowing
   with the window hidden? Does clicking the Dock icon bring it back?
   (There is no `activate` handler yet; expect no.) Does Cmd-Q quit cleanly?

**Record.** Panel state after wake, whether rejoin works, the hidden-window
audio and Dock behavior.

**Result.**

## Order

1 first; everything else needs its build. 2 and 3 in parallel after that.
4, 5, 6 independent of each other and of 2 and 3.

## Out of scope, on purpose

Intel Macs (ask Trey whether anyone has one), Linux (Matt), signing and
notarization (decision, not spike), performance baselines, the parity
table, and any fix beyond the few lines spikes 2 and 5 need.
