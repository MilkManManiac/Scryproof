# Mac sound sharing (desktop 0.5.10)

Implementation checkpoint, 2026-10-26. **Not release-ready until the real Mac call check and its deliberate call-leak control pass.** Acceptance is the brief in `docs/briefs/mac-audio.md`; unit tests and screenshots alone do not establish audio isolation.

## Route

Route A: `desktop/mac-audio/MacAudio.swift`, compiled by `desktop/scripts/build-mac-audio.mjs`, uses Apple's Core Audio process taps (macOS 14.2+, Darwin 23.2+). No driver, npm dependency, hosted service or permission bypass. Apple's current [sample and permission description](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps) and the installed Xcode CoreAudio headers were consulted.

The helper accepts `<Scryproof-main-pid> <all|window-id>`. The main process supplies these arguments from its own PID and an offered capture source, never a page-supplied arbitrary PID. For a window, CoreGraphics resolves its owning process. The helper includes that process's descendants and refuses the call app's own window. Whole-screen capture mixes all audio processes except the Scryproof tree and production Scryproof bundle IDs. It uses a positive list of eligible process objects, refreshed on Core Audio process-list notifications and a 250 ms timer. This is deliberate: a newly spawned audio service stays silent until classified; a global exclusion list could admit a new call helper before the notification arrives. An unexpected process-list error ends capture rather than widening it.

A private aggregate device attaches the tap to the default output device's hardware clock. Its output buffers are zeroed; it does not change the system's default output or mute source apps. `AVAudioConverter` normalizes the tap's format to 48 kHz stereo interleaved signed 16-bit PCM. stdout carries PCM only; stderr carries the existing `ok <pid>` / `error <reason>` handshake. stdin EOF, signals and pipe failure tear down the IO procedure, aggregate and tap. Core Audio teardown runs outside the IO callback queue. Electron gives a first permission request up to 120 seconds, then terminates the helper, with a two-second kill fallback on Mac.

The existing `onAppSound` preload bridge and `web/src/lib/app-sound.ts` turn PCM into a track. The screen and music publishers use their existing LiveKit ScreenShareAudio publication, sender keys and E2EE. Mac never requests Electron's Windows-only `audio: 'loopback'`. No encryption or server permission code changes.

## Capability, permissions and errors

The shell advertises `canShareSound` only when macOS is new enough and its native helper exists. The picker and Activities hint consume that capability. Old Mac shells, older macOS and missing helpers retain an honest unsupported hint. Sound remains opt-in. A native capture failure is carried to the page; the video publication is undone if its requested native audio could not start.

Before `getDisplayMedia`, a Mac-only IPC checks Screen Recording. If permission was absent at launch, enumerating sources lets macOS ask, and the page instructs the person to quit and reopen before attempting Chromium capture. This avoids starting a capture request with stale sources after a first grant. Starting a new share also clears the previous share-stop diagnostic. Errors live only in the in-memory voice session, not disk storage. First-grant and restart behavior still require manual runtime verification with the dev Electron grant reset, not the installed app.

System Settings > Privacy & Security > Screen & System Audio Recording is controlled by a person. In development the relevant app is **Electron**, `com.github.Electron`; depending on macOS attribution the helper or terminal can also be named. The installed app is **Scryproof**. Never edit TCC's database or reset the installed app's grant. Grant Screen Recording and System Audio Recording, then Quit & Reopen when requested.

## Windows-only path inventory

| Location | Disposition |
| --- | --- |
| `desktop/src/share-menu.js`: `canShareSound`, `soundOffer`, `shareAnswer`, loopback | Native Mac capability added; Windows loopback and older Windows fallback preserved. |
| `desktop/src/main.js`: `APP_SOUND_EXE`, `appSoundWorks`, `startAppSound` | Mac Swift executable added on the same PCM bridge. Whole-screen Mac uses native audio too. |
| `desktop/src/preload.cjs`: `onAppSound`, platform | Native capability, capture scope and error relay added. |
| `web/src/lib/desktop.ts`: `canShareSound`, Activities hint, `answerShare` | Shell capability honored; old Windows bridge behavior retained. |
| `web/src/components/ShareMacNotes.tsx`: forced Mac sound-off | Switch enabled when offered; unsupported Mac gets a version/helper hint. |
| `web/src/lib/voice-session.ts`: `restrictOwnAudio`, `systemAudio`, helper publication | Windows/browser hints retained. Native Mac stream uses the same encrypted publication and distinguishes window/global scope. |
| `web/src/lib/music-share.ts`, `CallMixer.tsx` | Existing music capture accepts native PCM; stopping music stops its native helper. |
| `web/src/lib/activity-status.ts` | Mac hint explains another app can share sound, Scryproof itself shares video only. |
| `desktop/src/push-to-talk-core.js`: Windows key mapping | Not an audio capture gate; unchanged. Mac already has its own key mapping. |
| `desktop/src/main.js`: Windows installer URL | Not an audio path; unchanged. |

Activities inside Scryproof cannot send their sound separately from the call: both use the same Chromium audio-service process. This implementation intentionally leaves all Scryproof sound out. Activities video works; separate app/game audio is the supported Mac sound source. Splitting the game's audio from the call requires a separate output process and is outside this helper.

## Real-call instrument

`scripts/mac-audio-check.mjs` starts dev Electron as wes, headless Chrome as alex, and two separate tone applications: A 1000 Hz, B 1500 Hz. They join the seeded local LiveKit call using the real sender-key agreement. Wes's fake microphone is 440 Hz; alex's is 700 Hz. Wes's app plays alex at output volume 0.3 (the check refuses below 0.2). A separate native include tap on the call app must measure alex above -45 dBFS, so muted or near-silent playback cannot masquerade as isolation.

The check selects A's window with sound: alex must receive A and reject B and both microphone frequencies. Then a screen: A and B must arrive and the call/mic must be at least 25 dB below the programs. Then mixer music on a whole screen with the same checks. Receiving music is opt-in. Measurements come from alex's actual decoded track analyser, not the helper's local buffer. The picker and connection-panel screenshots are saved with `SHARE_SOUND_SHOTS=docs/shots`.

`--red-proof` temporarily changes only the development main-process helper argument to exclude an unrelated PID, deliberately admitting the call into global capture. It restores the exact main source in `finally`. The required outcome is failure specifically at the call-isolation assertion, with the audible-call positive control passing. A permission failure, missing track, or failed join is not this red proof. Do not run this mode on a shared checkout or alongside another Electron dev session.

Run with API/web, seed and local LiveKit 1.13.6 already running, the helper built, and `web/dist` built. Set `CHROME` to a working Chromium executable; the machine's `/Applications/Google Chrome.app` wrapper currently points at a removed Playwright browser. The check now discovers installed Playwright Chromium before trying that wrapper; an explicit CHROME override also works. The supplied `.tools` symlink contains a Linux binary, so this lane compiled the exact LiveKit 1.13.6 source tag into the ignored `.mac-audio-check/livekit-server` without changing the linked source checkout.

```sh
# Separate terminals, from this worktree:
npm run db:migrate
npm run dev
npm run seed
.mac-audio-check/livekit-server --config infra/livekit/livekit.dev.yaml
node desktop/scripts/build-mac-audio.mjs
npm run build --workspace web
# Point CHROME at the installed Mac Chromium executable before this:
SHARE_SOUND_SHOTS=docs/shots node scripts/mac-audio-check.mjs
SHARE_SOUND_SHOTS=docs/shots node scripts/mac-audio-check.mjs --red-proof
```

## Release boundary

Desktop is bumped to 0.5.10. Both Mac packaging commands compile and include `Contents/Resources/mac-audio`; electron-builder's extra-binary signing list includes it, and `NSAudioCaptureUsageDescription` is in the app's Info.plist. No signed/notarized build was made in this lane. The coordinator must inspect the packaged helper's signature, hardened runtime, architecture and permissions in the signed app, notarize, install, and repeat the call with Trey and Wes before release. Wes must publish the Mac installer/zip/manifest for other Mac users. The page changes are bundled-client-only until Wes releases a web client containing them.

## Evidence and open work

Checkpoint results on Apple silicon, macOS 27.0.1, Swift 6.4, Electron 44.5.1:

- `testrun scryproof desktop-tests -- npm test` in desktop: **152 passed, 1 existing notarized-release test skipped**, 153 total. Windows-path tests remain green.
- Nine targeted web files (`app-sound`, `activities`, `desktop-platform`, Mac/Windows desktop wiring, `music-share`, `music-share-mac`, `voice-session`, `voice-session-flow`), Node test concurrency 8: **83 passed**.
- Root `npm run typecheck`: **passed** after correcting strict array access in a new test. Web production build: passed (existing large-chunk advisory only).
- Swift helper: clean compilation, verified Mach-O arm64. The locally compiled LiveKit binary reports **1.13.6** and is also Mach-O arm64.
- **12 unit-test red proofs passed**: old OS/missing helper capability, Mac sound offer, Mac opt-in, Mac switch rendering, bridge capability, first-grant relaunch, PCM tail preservation, capture scope, native error propagation, Activities explanation, unsupported music capture, and stale share error clearing. Each had its guarded behavior mutated, produced an assertion failure, and was restored before the final green checks. The ignored `.mac-audio-check/red-unit.mjs` preserves the mutation commands for this workspace.

Real-call output (incomplete; not an acceptance pass):

```text
PASS wes signs in
PASS Mac shell reports native sound capability
PASS alex signs in
PASS both join the channel
PASS encrypted real call
PASS wes requests window share
PASS picker offers sound for window
FAIL alex watches the share
FAIL window: received audio has an analyser
FAIL run finished: No share picker (check Screen Recording permission and relaunch Electron).
FAIL Mac real-call audio check: 3 failure(s).
```

The receiver had secured peer keys and a screen-audio publication, but no video publication in its displayed video list and no decoded share analyser. A process sample captured the native helper blocked at `Capture.start -> AudioDeviceCreateIOProcIDWithBlock -> HALC_ProxyIOContext::_TellServerAboutStreamUsage -> mach_msg2_trap`. A standalone 20-second native probe collected **0 PCM bytes** and had to be stopped. The coordinator confirmed Trey was away with the screen dark and **no confirmed permission grant**. Whether the native wait is solely permission-related remains unproven. Adding the output device as the aggregate clock did not unblock that standalone probe.

A short alternative-B probe with Electron's custom handler found no screen sources while the display was dark and returned AbortError / Invalid capture constraints. That is an invalid environment for judging Electron loopback; it establishes neither support nor failure of route B. Route C (Apple's system picker) was not attempted.

Screenshots: `docs/shots/mac-audio-picker-window.png` shows the offered native sound switch; `docs/shots/mac-audio-connection-window.png` shows the encrypted two-person call and the sender's sound label. **The label is not proof that any PCM was captured or received.** No passing whole-screen/music shot exists.

**Still required:** person grants dev Electron Screen Recording and System Audio Recording; relaunch; first-prompt/restart retest; passing window/screen/music real-call measurements including the audible-call positive control; the deliberate call-leak red proof; final connection screenshots; signed-bundle verification; Trey/Wes call and release. The deliberate-call-leak red proof was not run because the normal capture check has not reached a measurable receiver track. All dev servers, browsers, tones and helpers were stopped before the checkpoint. No installed-app permissions were reset and `/Applications/Scryproof.app` was not changed.
