# Brief: sound on the Mac (share sound, music share) and the screen-share error

Written 2026-10-26 by Trey's session for one build worker. Read `CLAUDE.md` (the non-negotiables) and `docs/HANDOFF.md` sections "Mac app 0.5.9 from main" and "How app sound works" before starting.

## What Trey asked (2026-10-26, after a call test of Mac 0.5.9 with Wes)

> "i cannot share audio at all from mac, apparently that isn't supported yet? we need to fully build that and make it work. share audio w/ stream, do the music stream thing, all audio stuff that doesn't currently work on mac, should."

> Bug: "i got a permission prompt did it and this is still on screen after restart: The screen share could not be started: Invalid capture constraints"

Everything else in the call worked: voice, camera, screen share without sound, pop-out close, watch from a name, push-to-talk. Wes shared his screen with sound from Windows and the echo bug is gone. Do not regress any of that.

## Done when

On an Apple-silicon Mac, in the Scryproof desktop app, against a real encrypted call:

1. **Screen or window share with sound.** Sharing a window with sound sends that program's sound; sharing the whole screen with sound sends everything except the call. The call's own voices are never in the share (that leak was the echo bug Wes and his friends heard; see HANDOFF 2026-10-12 to 10-14).
2. **Music share** (the call mixer's opt-in music, `web/src/lib/music-share.ts`) works from a Mac with the same rule: the call is left out.
3. **Every other Windows-only audio path** works on the Mac, or the finish report names it and says why not. Inventory them first: every `canShareSound`, `platform === 'win32'` and `app-sound` gate in `desktop/src` and `web/src`, including the Activities share hint (`web/src/lib/activity-status.ts`).
4. **The error is fixed.** The first share after the macOS Screen Recording prompt does not fail with "Invalid capture constraints", and no share error survives an app restart.
5. Macs that cannot do it (macOS older than the mechanism needs) get no sound option and an honest hint, never a broken share.

## What exists

- Gates: `desktop/src/share-menu.js` (`canShareSound = platform === 'win32'`, `shareAnswer`, `soundOffer`); `web/src/lib/desktop.ts:107` (`canShareSound`); `web/src/lib/activity-status.ts`; `web/src/lib/voice-session.ts` around lines 394-401 and 1188 (`restrictOwnAudio`, `systemAudio: 'include'`) and the error text at line 355.
- Windows design: `desktop/app-sound/AppSound.cs` (built by `desktop/scripts/build-app-sound.mjs`, shipped as `app-sound.exe`) records one window's process tree with Windows process loopback and streams PCM to the page, which publishes it as the share's sound. Whole-screen shares use Chromium's `loopbackWithoutChrome`. Design notes `docs/SPEC-app-audio.md`; probes `docs/spikes/app-sound/README.md`; the real-call check `scripts/share-sound-check.mjs`.
- Mac picker history: branch `spike/mac-desktop` and HANDOFF notes on the Mac picker.

## What we know about the Mac (checked 2026-10-26)

- Electron's docs say `audio: 'loopback'` in `setDisplayMediaRequestHandler` is Windows-only. In practice on macOS it works only with `useSystemPicker: true` (Apple's picker, macOS 15+). With our own picker the audio track is `ended` at once: Chromium's Core Audio tap permission probe fails and macOS never shows the "System Audio Recording Only" prompt (electron/electron issue 52738, open, Electron 43; check whether 44.5.1 changed it). Chromium removed the `MacCatapLoopbackAudioForScreenShare` flag in M155. `NSAudioCaptureUsageDescription` must be in Info.plist.
- **Recommended route (verify with a short spike first):** a small native helper using Core Audio process taps (macOS 14.2+: `CATapDescription`, `AudioHardwareCreateProcessTap`, an aggregate device). Use an include-list tap of the shared app's processes for a window share, and a global tap that excludes every Scryproof process (main, renderer, GPU and audio-service helpers) for a whole-screen share and for music share. Stream PCM to the page over the same path `app-sound.exe` uses, so the page side stays one design. Build the helper with `swiftc` from a script in `desktop/scripts/`, ship it in the bundle, signed by electron-builder with the hardened runtime.
- **Alternatives, in order:** (B) Electron's own loopback, if a granted "System Audio Recording Only" permission (for example via the helper's first tap) makes Chromium's probe succeed with our picker; (C) `useSystemPicker: true`, which replaces our picker UI: only if A and B fail, and stop and ask before doing it.
- TCC: macOS asks a person to allow screen recording and system audio recording. Never bypass it (no TCC database edits). When a prompt blocks you, message your parent with the exact steps for Trey. Resetting a grant you need to retest is fine for the dev Electron binary (`tccutil reset ScreenCapture com.github.Electron`); do not reset grants for the installed `/Applications/Scryproof.app` without asking.

## Proof required

- **A Mac real-call check**, modelled on `scripts/share-sound-check.mjs`. Run it on the local stack (`npm run dev:livekit`, `npm run dev`, seed), with the desktop app as wes (unpackaged `electron .` is fine) and headless Chrome as alex, in an encrypted call. Play tone program A from another app and share it, and play tone program B that is not shared. Have wes's app play alex's voice at a real volume; the 10-13 lesson is that muted or near-silent runs cannot see a leak. Assert that alex receives A and does not receive B, his own voice, or wes's mic. Then whole screen: both programs in, the call out. Then music share, under the same rule.
- **Red-proof the check once:** deliberately let the call into the share and watch the check go red.
- Screenshots of the picker with the sound option, and the connection panel while sharing with sound, in `docs/shots/`.
- **Targeted tests only:** `npm test` in `desktop` (Windows-path tests must stay green), the web tests you touch, and `npm run typecheck`. Do not run the full gate; the parent runs it once on the integrated result.

## Rules

- Follow `CLAUDE.md`'s non-negotiables. Sound shared in a call is a track in the encrypted call; never weaken that. Nothing phones home.
- Bump the desktop version to 0.5.10: Windows 0.5.9 is published, and this changes the shell.
- Do not change Windows behaviour. If shared code moves, Windows paths keep their tests.
- No GitHub, no publishing, no `release.sh`, no notarized build. The parent builds, notarizes and installs. Commit on your branch only, with commit bodies that state the checks that ran.
- Write `docs/SPEC-mac-audio.md` with what you built, the route chosen and why, what the check proves, and open problems.

## Finish report

Say what works on a Mac and how it was proven (check output, red-proof, shots), what is unproven, any step Trey must do by hand (permissions), and what Wes must release for it to reach other Mac users. The page changes ride in the bundled client only until Wes releases a client that includes them.
