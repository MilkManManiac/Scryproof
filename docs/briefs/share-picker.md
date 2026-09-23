# A screen-share picker you can see

Read `docs/briefs/README.md` first. Opus. Written 2026-09-23 from Wes's
notes: "For share screen can we show a preview of what screen you will
show? I feel like we can make that UI look better. Make it look like
Discord's or Zoom's share screen functions."

## What is there now

- **Desktop app:** `desktop/src/main.js`, `armPermissions` →
  `ses.setDisplayMediaRequestHandler`. It pops a *native context menu*
  (`desktop/src/share-menu.js`, `shareMenuTemplate`): screen and window
  names as text, and a sound checkbox that closes the menu when clicked and
  has to reopen it. No pictures. This is the ugly one, and most of the group
  uses the desktop app.
- **Browser:** `getDisplayMedia` shows Chrome's own picker, which already
  has previews and which a page cannot restyle. Leave it alone. Whatever
  the web app shows before calling `getDisplayMedia` (see
  `setScreenShare` in `web/src/lib/voice-session.ts` and the share button in
  `web/src/components/VoicePanel.tsx`) should still look right.

## The job

Replace the desktop menu with an in-app picker, drawn by the web client,
in the style of Discord's "Screen Share" dialog:

- Two tabs, **Screens** and **Applications** (windows). A grid of
  thumbnails, each with the window's app icon (`fetchWindowIcons`) and name
  under it. The selected one has a clear outline. Double-click shares.
- Thumbnails refresh every couple of seconds while the picker is open, so
  it feels live. Keep them small (`thumbnailSize` around 320x180) so this
  stays cheap; stop refreshing when it closes.
- The sound choice, same meaning as today (`SOUND_LABEL` and the comment in
  `share-menu.js` about loopback and echo), as a toggle in the dialog
  footer. Remembered as today (`shareWithSound`). Hidden where
  `canShareSound` is false.
- **Share** and **Cancel** buttons. Esc and clicking outside cancel.
- Use the existing `Modal` component and the app's tokens and themes;
  it must look at home in every theme, including the painted ones.

The shape, suggested:

1. The main process, on a display-media request, gets the sources with
   thumbnails and icons, and sends them to the page over the preload
   bridge (`desktop/src/preload.cjs`; follow how the existing bridge calls
   are named and guarded). Thumbnails as data URLs.
2. The page opens the picker. Its answer (a source id and the sound choice,
   or cancel) goes back over the bridge. Main answers `done()` exactly as
   `shareStreams` does today. Only accept a source id that was in the list
   it sent; anything else is a cancel.
3. A refresh message from the page asks main for fresh thumbnails while
   the picker is open.
4. Never leave the request unanswered: if the window closes or reloads
   mid-pick, answer with a cancel (Electron requires an answer).

Keep `share-menu.js` pure and tested: move the parts that still apply
(`shareStreams`, `canShareSound`, `SOUND_LABEL`, sorting sources into screens
and windows) and update its tests in `desktop/`. The web side must work with
an old shell too: if the bridge call does not exist, nothing changes.

## Also in this job, because it ships in the same shell release

**`tidyShellDir` runs too early.** After the app updates its own shell, the
installer that did it stays in `userData/shell-update/` until the next
launch: `tidyShellDir()` (`desktop/src/main.js` around line 280) runs at
start while that installer is still holding the file. Run it again about a
minute after start.

Bump `desktop/package.json` to 0.5.2. Do not run `npm run dist` or any
installer; the main session builds and publishes.

## Tests

`desktop/` has its own test command; run it along with the three in the
README. Add tests for whatever pure logic you add (the id check, the
screens and windows split).

## Not in this job

Anything about what the viewer sees of a share. The browser's picker.
