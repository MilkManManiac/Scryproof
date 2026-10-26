# Mac sound sharing (desktop 0.5.10)

Implemented and exercised on Apple silicon, macOS 27.0.1, Swift 6.4 and Electron 44.5.1. The authority is `docs/briefs/mac-audio.md`. The local encrypted-call test has a passing run and a deliberate call-leak red proof. A supplemental ON/OFF assertion is retained for the controlled window mix; its whole-machine measurements are diagnostic-only under the coordinator ruling below. Signing, notarization, installed-app checks and release belong to the coordinator and Wes.

## Implementation

Route A uses Core Audio process taps (macOS 14.2+, Darwin 23.2+), without a driver or third-party dependency. Source: `desktop/mac-audio/MacAudio.swift`; build: `desktop/scripts/build-mac-audio.mjs`. Apple's [capture sample](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps) and the installed Xcode CoreAudio headers informed the implementation.

The helper accepts `<Scryproof-main-pid> <all|window-id>`. Electron supplies its own PID and a source from its offered list. CoreGraphics resolves a window's owner. `ProcessSelection.swift` includes an audio process if it belongs to that owner's process tree **or its responsible PID belongs to the tree**. The latter covers launchd-parented WebKit XPC audio services. `dlsym` resolves `responsibility_get_pid_responsible_for_pid`; a missing symbol falls back to tree membership.

Exclusion wins: an audio process is rejected when its PID or responsible PID belongs to Scryproof's tree, or its bundle ID belongs to production Scryproof. A whole-machine mix uses a positive list of all other audio objects, refreshed on process-list notifications and every 250 ms. A new process stays silent until classified. macOS 26+ bundle-based process restoration is explicitly disabled so it cannot widen that list. Failure to refresh ends capture.

A private aggregate device attaches the tap to the default output device's clock. Its output buffers are zeroed; the original apps remain audible and the default output device is not changed. `AVAudioConverter` emits 48 kHz stereo interleaved signed 16-bit PCM. **Use the aggregate's actual nominal rate for converter input**, not the tap's initial rate: this Mac produced tap=48000 / aggregate=44100, shifting a nominal 700 Hz control to about 762 Hz before that correction. The real-call control now checks pitch as well as level.

`PCMWriter.swift` handles non-blocking stdout. It completes partial writes in order and retains their remainder through EAGAIN. When its application queue reaches 96,000 bytes (0.5 seconds), it discards whole pending chunks; it never discards the tail of a partial write. EAGAIN does not end capture. A closed descriptor/pipe or real write error does. stdin EOF and signals destroy the IO procedure, aggregate and tap; teardown runs outside the IO callback queue. Electron has a Mac-only kill fallback for a stuck teardown.

The existing preload PCM bridge and `web/src/lib/app-sound.ts` produce the track. Screen and music use their existing LiveKit ScreenShareAudio publication and sender-key E2EE. Capture scope reaches the connection panel as window or machine. Mac never asks Electron for Windows `audio: 'loopback'`. No server permissions, keys or encryption are changed.

## Permissions and the restart error

The shell offers native sound only when the OS is new enough and the helper exists. Old Mac shells and unsupported Macs keep sound disabled with an honest hint; mixer music is disabled too. Sound remains opt-in.

A Mac-only preflight precedes `getDisplayMedia`. If Screen Recording was absent at launch, Electron enumerates sources before attempting Chromium capture; the page explains manual setup when no prompt appears. It explicitly says to **quit with Cmd-Q and reopen**: closing the window hides Scryproof and preserves the in-memory error. A new share also clears its previous stop diagnostic. Capture errors are not persisted to disk. Native startup errors reach the page and roll back an accompanying video publication. If native music startup throws, every unpublished capture track is stopped before the error is rethrown; its test failed before the cleanup fix and passed afterwards.

Observed first-share test: only dev Electron's ScreenCapture grant was reset. The page showed the Cmd-Q instruction and **no Invalid capture constraints**. macOS did not show a Screen Recording prompt or list Electron automatically, so Trey added Electron by hand under **Privacy & Security > Screen & System Audio Recording**. Quit & Reopen launched a bare Electron without test arguments; it was then relaunched with the test arguments. The new process had no old share error and shared successfully. The message now includes the + button / Applications fallback.

**Launch dev Electron through LaunchServices.** On this machine a shell-launched helper is attributed to cmux. The checker uses `open -n -a Electron.app --env ... --args ...`; its helper is attributed to Electron. Live runs use `caffeinate -dimsu -- ...`. A sleeping/locked display can return no capture sources. The installed `/Applications/Scryproof.app` and its grants were untouched.

## Windows-only path inventory

| Path | Result |
| --- | --- |
| `desktop/src/share-menu.js`: capability, offer, answer and loopback | Native Mac offer added; Windows selection/fallback retained. |
| `desktop/src/main.js`: helper startup and lifecycle | Swift helper added, including whole-machine Mac audio. |
| `desktop/src/preload.cjs`: PCM bridge/platform | Capability, scope and error relay added. |
| `web/src/lib/desktop.ts` | Shell capability and permission preflight honored; old Windows fallback retained. |
| `web/src/components/ShareMacNotes.tsx` | Capable Mac gets the switch; unsupported Mac gets a version/helper hint. |
| `web/src/lib/voice-session.ts` | Native audio uses existing encrypted publication; scope and cleanup extended. |
| `web/src/lib/music-share.ts`, `CallMixer.tsx` | Native music capture; unsupported-Mac guard; stopping music stops its helper. |
| `web/src/lib/activity-status.ts` | Explains another app can share sound while Scryproof itself shares video only. |
| Windows PTT mapping and installer URL | Not audio-capture gates; unchanged. |

Activities inside Scryproof still share **video only** on Mac. Their audio and the call use the same Chromium audio-service process, which must be excluded. Separately running games/apps are supported sound sources. Separating in-app game audio requires another output process. Mac picker/mixer/connection strings say "this Mac"; Windows keeps its PC wording.

## Real encrypted-call check

`scripts/mac-audio-check.mjs` launches wes in dev Electron and alex in headless Chrome against seeded local LiveKit 1.13.6. Two separate apps play A=1000 Hz and B=1500 Hz. `MAC_AUDIO_WEBKIT=1` makes A a native WKWebView fixture (`scripts/fixtures/mac-audio-tone.swift`) so the window check exercises responsible-process capture. Wes's fake mic is 440 Hz; alex's final call tone is 2500 Hz.

The check requires a real audible call: wes output volume is 0.3 (values below 0.2 are refused). A separate include tap records what wes's app is actually playing. Its call tone must exceed -45 dBFS and retain the correct pitch. Alex's decoded share analyser must receive A; a window must reject B; a screen/music share must receive A and B. Call and mic must remain at least **25 dB below the programs**. The analyser and margin were not relaxed.

The positive-control PCM metric averages power in short windows. A single coherent multi-second Fourier sum can cancel an audible tone across codec phase changes. `scripts/tests/mac-audio-spectrum.test.mjs` guards both that case and silence, and both were red-proofed.

`--red-proof` temporarily substitutes an unrelated excluded PID in the development helper launch, admitting the call into global capture, then restores the exact main source in `finally`. A permission/startup failure is not a valid red proof: the audible positive control must pass and the call-exclusion assertions must fail.

Reproduce after building the helper and web/dist, with the seeded API/web and LiveKit running:

```sh
caffeinate -dimsu -- testrun scryproof mac-audio-call -- env MAC_AUDIO_WEBKIT=1 SHARE_SOUND_SHOTS=docs/shots node scripts/mac-audio-check.mjs
caffeinate -dimsu -- testrun scryproof mac-audio-red -- env MAC_AUDIO_WEBKIT=1 node scripts/mac-audio-check.mjs --red-proof
```

The checker discovers installed Playwright Chromium; `/Applications/Google Chrome.app` currently wraps a deleted cache version. The supplied `.tools` symlink contains Linux LiveKit. This lane built the exact 1.13.6 source tag into ignored `.mac-audio-check/livekit-server`, runnable with `--config infra/livekit/livekit.dev.yaml`, without modifying the linked source checkout.

## Results and instrument decisions

Passing run: [full output](checks/mac-audio-call.txt). Levels below are receiver dB; the playback control is a separate native recording.

| Mode | A | B | Call ON | Mic | Call OFF | Floor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| WebKit window | -44.8 | -121.8 | -137.9 | -125.5 | -137.5 | -137.3 |
| Whole screen | -44.9 | -44.4 | -108.7 | -90.5 | -128.2 | -130.9 |
| Music | -44.9 | -44.4 | -125.2 | -122.3 | -124.0 | -136.7 |

Playback control: **2500 Hz, -20.8 dBFS at volume 0.3**. Result: `PASS Mac real-call audio check: 0 failure(s).`

Red proof: [full output](checks/mac-audio-red.txt). Screen and music received the deliberately admitted 2500 Hz call at **-35.3 dB** against programs around -44.9/-44.4 dB. Playback control remained **-20.8 dBFS**. The 25 dB assertions failed in both global modes. The then-active global ON/OFF assertions also failed: **4 expected failures** in that recorded run; under the final rule those extra global comparisons are diagnostic-only. Main source was restored.

The original 700 Hz test failed its strict margin near a program tone. [Diagnostic output](checks/mac-audio-700hz-diagnostic.txt) showed receiver ON/OFF values window -69.4/-69.6, screen -69.1/-70.1, music -70.0/-71.0 dB. Independent native taps put 700 Hz at -85.1/-84.7/-82.3 versus programs -31.2 dBFS. The analyser's three-bin search for 700 includes the 750 Hz neighbour, capturing program/codec side noise. The coordinator accepted that instrument diagnosis on 2026-10-26 and approved moving the voice input to 2500 Hz with the same analyser, 25 dB margin and audible control.

A supplemental ON/OFF assertion was added at the coordinator's request, then made floor-aware by his ruling: ON <= max(OFF + 3 dB, measured floor + 6 dB). It passed in the earlier before-red run and failed during deliberate leakage. It is still intermittent at very low levels in an uncontrolled whole-machine mix. The [restored run](checks/mac-audio-restored.txt) passed every primary isolation/control check but failed the supplemental music check: ON -108.8 / OFF -129.0 / floor -130.4 dB, programs -44.9/-44.3. That spectrum also contained new 609/844/797 Hz peaks. This failure is preserved, not hidden by rerunning. The coordinator ruled on 2026-10-26 that ON/OFF remains pass/fail for the controlled window capture, but becomes diagnostic-only for screen/music, which capture unrelated machine sounds at different times. The primary 25 dB margin, playback control and analyser are unchanged. The final normal run passed **0 failures** under that rule; the previous fully passing run is also preserved in [before-red output](checks/mac-audio-before-red.txt).

## Review findings

- **R1 fixed:** responsible-process inclusion/exclusion, missing-symbol fallback, native tests and real WebKit-window reception above.
- **R2 fixed:** bounded pending PCM, preserved partial writes, EAGAIN recovery. A real pipe reader paused for one second and then received fresh audio. Four native scenarios passed; nine mutations separately red-proofed the ownership guards and writer behavior.
- **R3 fixed:** Cmd-Q / closing-window explanation, manual + fallback, first-share error screenshot, and real quit/reopen checks with no retained error.
- **R4 fixed:** Mac mixer and connection panel say "this Mac"; the live check asserts the mixer wording. Picker/Activities have no PC wording.
- **R5 observed and dispositioned:** full Screen & System Audio Recording permission yielded **61,440 PCM bytes / 15,892 nonzero bytes**, with no separate audio-only prompt. Every shipping Mac sound path requires that combined grant through display capture. The coordinator declined an extra toggle-off test; no actual denial was performed and denied-buffer semantics remain unmeasured. Helper startup/error reporting remains in place.

## Targeted verification and release

Desktop `npm test`: **152 passed, 1 existing notarized-release skip**. Ten targeted web files: **84 passed**. Native: **4 scenarios / 11 assertions passed**, including real paused-reader recovery. Spectrum: **2 passed**. Root typecheck, web build, Swift arm64 build, JS syntax and diff checks passed. New native/spectrum/permission-wording tests were red-proofed; the original checkpoint also retained 12 unit mutation proofs. No full project gate was run.

Desktop is 0.5.10. Mac packaging compiles and includes `Contents/Resources/mac-audio`, signs it as an extra binary under the hardened runtime, and carries `NSAudioCaptureUsageDescription`. No signed/notarized build was made here. The coordinator must run the integrated gate, inspect the signed helper/bundle, notarize, install and repeat the Trey/Wes call. Other macOS versions and changing output devices mid-share are not runtime-proven. Wes publishes the Mac installer/zip/manifest; page changes remain bundled-only until his web-client release. Every lane-started server, test app, tone, browser and helper was stopped before commit.

Screenshots: [first Screen Recording instruction](shots/mac-audio-first-screen-permission.png), [window picker](shots/mac-audio-picker-window.png), [screen/music picker](shots/mac-audio-picker-screen.png), [window connection](shots/mac-audio-connection-window.png), [screen connection](shots/mac-audio-connection-screen.png), [music connection](shots/mac-audio-connection-music.png).
