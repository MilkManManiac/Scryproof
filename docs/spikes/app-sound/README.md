# Share sound probes (2026-10-12)

Silent tones (gain 0.0003) from separate Electron apps: `tone --freq=1000` stands in for Spotify (the shared window), `tone --freq=1500` for a game, and each probe plays 440 Hz itself as "the call".

- `probe/`: what Electron 44.4.3's own capture sends. Result: `audio: 'loopback'` plus the page's `restrictOwnAudio: true` becomes `loopbackWithoutChrome` (the app's own sound gone, -185 dB; every other program kept). `windowAudio` and the old chromeMediaSource route are plain loopback. Nothing in Electron records one program alone.
- `chain/`: the real `desktop/src/preload.cjs`, the helper code from `desktop/src/main.js`, and the real `web/src/lib/app-sound.ts` (bundle with `esbuild entry.ts --bundle --format=iife --outfile=page.js`). Result: a live track with the window's tone (-97 dB at that gain) and the game at -161 dB; Stop ends the helper.

Run: start both tones with `Start-Process electron.exe <dir>\tone --freq=...`, find the 1000 Hz window's handle (`(Get-Process electron | ? MainWindowTitle -eq 'tone-1000').MainWindowHandle`), then `electron.exe chain --hwnd=<handle>`. Logs go to `out.txt` (electron.exe prints nothing to the shell).
