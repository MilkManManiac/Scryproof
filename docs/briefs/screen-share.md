# Screen share: two at once, sound, and the watcher's controls

Read `docs/briefs/README.md` first. Opus. Voice is the most fragile part of
the app; read `docs/voice-e2ee.md` before touching `voice-session.ts`.
Non-negotiable 2: encryption is never off, not even for a test.

## What happened

Wes and his brother tried to share screens at the same time and "it did
not work". Both were in the **desktop app** (Electron 44, LiveKit JS
2.22.3). Server logs from 2026-09-23 01:31 UTC:

- milky (Wes) published a screen share with `SCREEN_SHARE_AUDIO`, then
  published a fresh one 14 seconds later.
- zrhunter (his brother) published a share at 01:31:50, then again at
  01:32:31, 01:32:49 and 01:33:44, then left and rejoined the call twice.
  So his share kept dying or not showing, and he kept retrying.
- One server error at 01:32:34 on zrhunter: `Incoming unhandled RTP
  ssrc(...) no trackStreams found for RID: rsid(q)`. Probably fallout of
  re-publishing quickly rather than the cause, but note it.

What is already proven, in the main session: `npm run test:voice` now has
a two-screens block (alex and wes share at once, mara decodes both, each
sharer sees the other, both are on mara's screen). **It passes, 41 of 41,
in headless Chrome.** So the web code handles two shares. The difference
is the desktop app, where `desktop/src/main.js` `setDisplayMediaRequestHandler`
answers every share request that asks for audio with `audio: 'loopback'`:
the **whole machine's sound, including the call itself**. With two people
sharing, each one's share carries the other's voice and screen sound back
into the call. `restrictOwnAudio` in `setScreenShare`
(`web/src/lib/voice-session.ts`) does nothing for Electron loopback.

Leading suspect: the loopback feedback. It is not proven. You cannot run
two desktop apps here, so do not claim you found it; say what you changed
and why, and what Wes should look for when he tests.

## The job

1. **Sound is a choice.** Starting a share asks: with sound or without.
   Desktop: the popup menu in `main.js` gets it (the list of screens and
   windows, then "Include sound" as a checkbox item that defaults off and
   is remembered for next time). Browser: Chrome's own picker already has
   a sound checkbox; make sure we ask for audio in a way that lets it
   show, and do not force it on. Default off in both. Look in
   `node_modules/electron/electron.d.ts` for what `audio` accepts in
   Electron 44 (`'loopback'`, `'loopbackWithMute'`, anything that excludes
   this app's own output). If something excludes our own process, use it
   and say so. If nothing does, the menu item says "Include sound (the
   call may echo)".
2. **Say why a share stopped.** Today a share that dies leaves no trace.
   On the sharer's side: when their own screen track ends without them
   pressing Stop (`ended` on the MediaStreamTrack, LocalTrackUnpublished,
   an encoder error), show one plain line in the voice panel ("Your share
   stopped: the window closed", or the error's message) and keep the last
   one in the connection panel. On the watcher's side: a screen tile that
   has had no new frames for 3 seconds says so ("No picture from Zach's
   screen for 5 s"). Frame counts are already read by `debugVideo()`;
   build on that, do not add a second poller.
3. **Volume of a stream you are watching**, separate from the person's
   voice. A slider on the screen tile or its focus bar. Screen audio is
   its own key in the mix (`<userId>:screen`); per-person volumes live in
   `voice-prefs.ts` `volumes`. Local only.
4. **Hide a camera for me.** On a camera tile, "Hide for me" stops
   subscribing to that camera (saves bandwidth) until you undo it or leave
   the call. Local only. A placeholder tile says "Camera hidden" with a
   Show button.

## Tests

- Keep `scripts/voice-check.mjs` passing in your head: do not rename the
  buttons it clicks ("Share your screen", "Turn camera on", "Leave",
  "Join", "Make small"). You may NOT run it (it needs the dev servers the
  main session owns). The main session runs it after merge.
- Unit-test whatever pure logic you add (for example "no frames for N
  seconds" as a function of samples) under `web/src/tests/`.
- `node --test desktop/test/*.test.mjs` you may run. If you pull the
  share menu into a pure function, test it there.

## Not in this job

Changing codecs or simulcast layers. Anything on the server. The speaking
ring (another brief is in `voice-session.ts` at the same time; keep your
changes out of `refreshSpeaking` and the level code).
