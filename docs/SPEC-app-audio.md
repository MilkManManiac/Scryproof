# Share one program's sound only (desktop app, Windows)

## Summary (write this last, for Wes, plain English)

_Empty until the build is done. Then: what you can do now, how to try it, the screenshots, what does not work yet, three things to try, check results, and whether it actually ran on a real Windows PC with Spotify and a game open._

---

**Who this is for:** a builder working alone (Opus, a helper, or a cloud session). Wes will not answer questions. Never stop to ask. Make the call and log it under "Decisions I made" at the bottom.

**Phase:** finishing a real feature people use in calls. It must work, fail safely, and say plainly what is being sent.

## What and why

Wes's words, 2026-10-06:
- "RL audio coming through when streaming spotify"
- "yea that was rocket league"

Today, sharing music (or a screen) from the Windows desktop app with "Include sound" sends **everything the PC plays**: Spotify, Rocket League, and the call itself (the echo). Electron's only option on Windows is `audio: 'loopback'` (see the header of `desktop/src/share-menu.js`). The fix: when a **window** is picked, send only the sound of the program that owns that window and its child processes. Picking a **whole screen** sends everything except Scryproof's own sound, so the call stops echoing. Windows has had a built-in API for exactly this since Windows 10 version 2004 (build 19041): process loopback capture.

The audio still goes out as the same published track (`MUSIC_TRACK`, `Track.Source.ScreenShareAudio`) in the same E2EE room, so it stays end-to-end encrypted with no new code on that side.

## Ground rules

1. **Branch:** create `app-audio` from `main`. Work and push only there. Never touch `main`, `oct6-feedback` or anyone else's branch. Never merge, never force-push. Push after every phase.
2. **No worktrees with junctioned `node_modules`** (PAPERCUTS 2026-10-04: `git worktree remove --force` followed a junction and wiped `web/`, `server/`, `shared/`). Work in a plain checkout.
3. **No third-party packages.** Wes wants to own the helper. No npm audio/FFI packages (no koffi, ffi-napi, naudiodon, NAudio). Windows APIs only.
4. **Files you may create:** `desktop/native/process-audio/ProcessAudio.cs`, `desktop/scripts/build-audio-helper.mjs`, `desktop/src/process-audio-core.js`, `desktop/src/process-audio.js`, `desktop/test/process-audio-core.test.mjs`, `web/public/worklets/process-audio.js`, `web/src/lib/process-audio.ts` (+ its test), `docs/shots/app-audio-*.png`.
   **Files you may edit:** `desktop/src/main.js` (share picker section only), `desktop/src/share-menu.js`, `desktop/test/share-menu.test.mjs`, `desktop/src/preload.cjs`, `desktop/package.json`, `.gitignore` (the built exe), `web/src/lib/music-share.ts`, `web/src/lib/desktop.ts` (bridge types), `web/src/components/SharePicker.tsx`, `web/src/changelog.ts` (one What's new entry), `docs/HANDOFF.md`, this file. `web/src/lib/voice-session.ts` only in Phase 5.
   Another builder may be working on `docs/SPEC-stream-chat.md` (branch `stream-chat`), which edits `voice-session.ts`, `VoicePanel.tsx` and `CallMixer.tsx`. Keep your `voice-session.ts` change small.
5. **Stuck rule:** two honest attempts, then write it under "Open problems", commit what works, move on if the next phase does not depend on it.
6. **Style:** match the surrounding code (long explanatory header comments, plain words). No emoji. UI text short and plain.
7. **Never publish.** No `release.sh`, no `publish-installer.sh`, no deploy. Wes says when.

## Read first

- `CLAUDE.md` and `GAMEPLAN.md` section 8: no third party in the data path, E2EE for share audio, "encrypted" only where true.
- `desktop/src/share-menu.js`: `SOUND_LABEL`, `canShareSound`, `shareStreams` (returns `{ video, audio: 'loopback' }`), `sourceKind`, `shareAnswer`.
- `desktop/src/main.js` around `setDisplayMediaRequestHandler` and `openSharePicker` / `armSharePicker` / `finishPick` / `pageGone`: how a pick is answered.
- `desktop/src/preload.cjs`: the `share` bridge (`scryproof:share-open`, `share-answer`).
- `web/src/components/SharePicker.tsx`: the picker the page draws; music mode says "Turn on Include sound. Only audio will be sent".
- `web/src/lib/music-share.ts` `captureMusic()` and `web/src/lib/voice-session.ts` `startMusic()` (search `musicBusy`, `MUSIC_TRACK`): the track is published with `publishTrack(track, { source: ScreenShareAudio, name: MUSIC_TRACK, ... })`.
- `web/src/lib/audio-graph.ts` (line ~40) and `web/public/worklets/`: how this app already loads AudioWorklets.
- `desktop/package.json` `build` section and `scripts/publish-installer.sh`: how the installer is built and shipped.

## The design

### 1. The helper: `scryproof-audio.exe` (C#, compiled with the C# compiler that ships in Windows)

**Toolchain on Wes's PC (checked 2026-10-06):** no `cl`, `rustc`, `cargo`, `zig`, `g++`, `gcc` or `clang`; no Visual Studio, no Windows SDK. `dotnet` is present but has **no SDK** (`dotnet --list-sdks` is empty). Present and usable: `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, the .NET Framework 4 compiler that is part of Windows. It compiles C# 5 (no `$""` strings, no `=>` members, no tuples). .NET Framework 4.8 is built into Windows 10 1903 and later, so the exe needs nothing installed. Use it. `build-audio-helper.mjs` runs `csc.exe /nologo /optimize /target:exe /platform:x64 /out:native/process-audio/scryproof-audio.exe ProcessAudio.cs`. The built exe is gitignored; the source is committed.

Command line (numbers only, nothing else accepted):
- `scryproof-audio.exe probe` prints one JSON line `{"ok":true,"build":22631}` and exits 0 if process loopback activates on this machine, else `{"ok":false,"reason":"..."}`.
- `scryproof-audio.exe include <hwnd>`: resolve the window to a process with `GetWindowThreadProcessId`, capture that process tree.
- `scryproof-audio.exe exclude <pid>`: capture everything except that process tree (used with Scryproof's own main PID).

What it does (pin these, they are the known gotchas):
- `[MTAThread]` Main. Call `ActivateAudioInterfaceAsync` (mmdevapi.dll) with device id `VAD\Process_Loopback` (`VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK`), IID of `IAudioClient`, and a `PROPVARIANT` of type `VT_BLOB` pointing at `AUDIOCLIENT_ACTIVATION_PARAMS { ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK (1), ProcessLoopbackParams = { TargetProcessId, ProcessLoopbackMode } }`, mode `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE (0)` or `..._EXCLUDE_TARGET_PROCESS_TREE (1)`.
- The completion handler class implements `IActivateAudioInterfaceCompletionHandler` **and** the `IAgileObject` marker (IID `94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90`), or activation fails/hangs. Wait on an event, then `GetActivateResult`.
- `GetMixFormat` returns `E_NOTIMPL` for this virtual device. Pass a fixed format: PCM, 2 channels, 48000 Hz, 16 bit (block align 4). `Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM, 200 ms, 0, &format, null)`.
- Event loop: `SetEventHandle`, `Start`, wait, drain `IAudioCaptureClient.GetBuffer/ReleaseBuffer`, write raw bytes to stdout (binary, unbuffered writes per packet). Honour `AUDCLNT_BUFFERFLAGS_SILENT` (write zeros).
- When the target plays nothing, Windows delivers **no packets**. The helper does not pad; the worklet plays silence when its buffer is empty.
- Exits cleanly when stdin closes (main closes it to stop) or stdout breaks. Errors go to stderr as one JSON line and a non-zero exit.

### 2. Main process (`process-audio-core.js` pure, `process-audio.js` glue)

- `processLoopbackSupported()`: `process.platform === 'win32'`, build from `os.release()` third part `>= 19041`, the exe exists at `join(process.resourcesPath, 'scryproof-audio.exe')` (dev: `desktop/native/process-audio/`), and `probe` said ok. Probe once, lazily, cache the answer.
- `hwndFromSourceId(id)`: desktopCapturer ids are `window:<HWND>:<n>` / `screen:<n>:0`. Parse the middle number for `window:`. **Verify in Phase 0** that it is the real HWND (helper's `GetWindowThreadProcessId` returns the owning program's PID).
- Refuse to `include` our own process (a window owned by Scryproof's PID or a child): fall back to "no sound" for that pick.
- `shareStreams` grows a third outcome: `{ video: source }` plus `processAudio: { mode: 'include', hwnd }` for a window, `{ mode: 'exclude', pid: process.pid }` for a screen, when supported; today's `audio: 'loopback'` when not. Only ids from the offered list ever reach the helper (`shareAnswer` already enforces that); the page never sends a PID or HWND.
- On answer: spawn the helper (`windowsHide: true`, stdio pipes), create a `MessageChannelMain`, send `port2` to the page with `win.webContents.postMessage('scryproof:process-audio', { sampleRate: 48000, channels: 2 }, [port2])` **before** calling `done({ video })`. Forward each stdout chunk as an ArrayBuffer on `port1`. Kill the helper when: `port1` emits `close`, the helper exits (post `{ ended: true, reason }` first), `pageGone()`, the window closes, or the app quits. One helper at a time; a new pick stops the old one.

### 3. Preload and page

- `preload.cjs`: on `scryproof:process-audio`, relay to the main world with `window.postMessage({ type: 'scryproof:process-audio', format }, location.origin, event.ports)` (contextBridge cannot carry ports). Expose `share.processAudioSupported` (boolean) so the page can label things.
- `web/src/lib/process-audio.ts`: `waitForProcessAudio(timeoutMs = 2000): Promise<MessagePort | null>` (listener added **before** `getDisplayMedia` is called), and `processAudioTrack(port)`: `new AudioContext({ sampleRate: 48000 })`, load `/worklets/process-audio.js` the same way `audio-graph.ts` loads worklets, transfer the port into the worklet (`node.port.postMessage({ port }, [port])`; if transfer fails, relay through `node.port`), connect to a `MediaStreamAudioDestinationNode`, return its track with `contentHint = 'music'`. Stopping the track closes the port and the context.
- Worklet: ring buffer of int16 stereo, about 1 s capacity. Start playing at 60 ms buffered. Over 250 ms buffered (clock drift), drop down to 60 ms. Empty: output zeros. Convert int16 to float.
- `captureMusic()`: if the desktop bridge says supported, start `waitForProcessAudio()`, call `getDisplayMedia` as now; if the stream has no audio track and a port arrives, return `processAudioTrack(port)`. Everything after that (`startMusic`, `publishTrack`, E2EE) is unchanged. Browser and Mac paths unchanged.

### 4. Labels (the switch must say what is sent)

| Pick | Supported | Switch label |
|---|---|---|
| A window | yes | `Include this app's sound` |
| A screen | yes | `Include sound (not the call)` |
| Anything | no (Windows before 2004, helper missing or probe failed) | today's `Include sound (the call may echo)` |
| Mac / browser | n/a | unchanged |

The page picks the label from the selected source kind; `soundLabel` from main becomes `{ window, screen }`. Older pages that read a string still work (send `soundLabel` as before plus `soundLabels`).

### 5. Installer

**A new Windows installer is required.** The helper is a new file in the shell; a client-only update cannot deliver it. Old shells keep loopback; the new web client must detect the bridge and fall back.
- `desktop/package.json`: `"helper": "node scripts/build-audio-helper.mjs"`; `dist` runs `npm run helper` first; a `win.extraResources` entry copies `native/process-audio/scryproof-audio.exe` to `scryproof-audio.exe` (Windows only, Mac build untouched). It cannot live inside the asar.
- Bump `version` to `0.5.8` (the shell is 0.5.7 as of 2026-10-09; re-read `share-menu.js` and `permissions-core.js` for what changed since this spec was written).
- The installer is not Authenticode-signed today and the helper will not be either; `installer.json`'s sha256 (signed by `sign-installer.mjs`) covers it. Note in the summary that Defender/SmartScreen may look at a new unsigned exe.

## Phases (each ends runnable, with one check and a push)

**Phase 0: baseline and the two facts.** `npm ci` if needed, `cd desktop && npm test` (record the count), `npm run typecheck`, `npm test --workspace web` (record). Write the smallest `ProcessAudio.cs` with only `pid-of <hwnd>` and `probe`, compile with csc.exe. Start the dev desktop app, log one `window:` source id for Spotify, run `pid-of` on it.
Check: `pid-of` returns the PID `tasklist` shows for Spotify.exe, and `probe` prints `ok:true` on this PC. If either fails, stop the feature: log it under Open problems and write the summary.

**Phase 1: the helper captures one program.** Add `include` / `exclude`.
Check: with Spotify and a second sound source (a YouTube tab or Rocket League) both playing, `scryproof-audio.exe include <spotify hwnd> > spotify.raw` for 10 s, convert to WAV with a few lines of node, and confirm RMS is clearly non-zero; with only the other source playing, RMS is near zero. Screenshot or paste of the two numbers: `docs/shots/app-audio-helper.png` (a terminal screenshot is fine).

**Phase 2: main and preload plumbing.** `process-audio-core.js` + tests (id parsing, build check, refuse self, mode choice); `process-audio.js` spawn/port/kill.
Check: `cd desktop && npm test` passes with the new tests; in the dev app, sharing Spotify logs about 192 KB/s arriving at the page, and closing the share leaves no `scryproof-audio.exe` in `tasklist`.

**Phase 3: music share sends only that program.** Worklet, `process-audio.ts`, `captureMusic` change, labels in `SharePicker.tsx`.
Check: two people in a local dev call (desktop app + a browser, `npm run dev` + `npm run dev:livekit`). Sharer plays Spotify and Rocket League/YouTube, shares the Spotify window as music. The listener hears Spotify only, and the call panel still says encrypted. Screenshot `docs/shots/app-audio-picker.png` (picker with the new label) and `app-audio-call.png`.

**Phase 4: fallbacks and the installer.** Old-shell/new-client and helper-missing paths fall back to loopback with the old label; `npm run dist` builds an installer containing `resources/scryproof-audio.exe`.
Check: rename the exe in a dev run and confirm the old label and loopback come back; list the built installer's size and the unpacked `release/win-unpacked/resources/` contents. Do not publish.

**Phase 5 (optional, last): screen share with sound uses it too.** Screen share goes through LiveKit's `setScreenShareEnabled(true, { audio: true })`, which gets its audio from `getDisplayMedia`. When main answers with video only plus a port, publish the process track as `Track.Source.ScreenShareAudio` (default name, not `MUSIC_TRACK`) and unpublish it with the screen share. Small change in `voice-session.ts` `setScreenShare`.
Check: share a Rocket League window with sound to a browser listener; the listener hears the game and not the call (no echo of their own voice).

Full checks once at the end: `npm run typecheck`, `npm test`, `cd desktop && npm test`. Zero console errors in the dev app during Phase 3.

**Must never happen:** sound from a program that was not picked goes out after a window pick; a helper left running after the share stops; any PID/HWND taken from the page; any audio leaving outside the E2EE LiveKit publication; a label that promises "only this app" when loopback is in use.

**Stop rule:** stop after Phase 4 (or 5 if it went smoothly), or at 3 hours, or if Phase 0 fails. Then write the summary at the top and add a HANDOFF section.

## Known limits to state in the summary

- Windows 10 2004+ only; older Windows keeps today's behaviour.
- A program minimised to the tray has no window to pick (Spotify closed to tray): use the screen with sound, which now leaves the call out but includes everything else.
- Picking a Chrome window sends all of Chrome's sound (every tab), because Chrome plays audio from one child process.
- Mac is unchanged (macOS 14.2 has its own per-process tap API; not in this spec).

## Decisions I made

## Open problems
