# Four things Wes noticed

Read `docs/briefs/README.md` first. Opus. Written 2026-09-23 from Wes's
notes. One commit each. His words are quoted so you can judge the fix
against them, not against this brief.

1. **Open a channel at the bottom.** "Make it so whenever you go to a
   channel or chat it auto shows the very bottom of the chat, aka the most
   recent text." The code means to (`MessageList.tsx`, and the DM view in
   `DirectMessages.tsx`), so this is a bug that happens in real use and
   not in tests. Likely causes, in order: images, link previews, voice
   notes, polls or sealed messages that change height after the first
   scroll; history arriving in two steps; the unread line or "where you
   stopped" jump winning over the bottom. Find which, with evidence (a
   unit test or a script that shows the list not at the bottom before your
   fix, and at the bottom after). The rule to end up with: opening a
   channel or DM shows the newest message, and stays pinned to the bottom
   while things above it finish loading, until the person scrolls up
   themselves. If a "jump to unread" behaviour exists, it may stay as a
   button, not as where the list opens. Say in the report what it was.
2. **The composer's buttons line up.** "In the chat bar at the bottom, the
   emoji and the Tang aren't centered like the rest of the buttons/text."
   The smiley and the character (face) button beside Send in
   `Composer.tsx`, styles in `web/src/styles.css`. Centre every button in
   that bar on the same line as the text, at the default size and at the
   interface scales 90 and 130 percent, in the DM composer too.
3. **The picture viewer's clicking.** "Clicking on an image pops it out.
   Then it acts weird with clicking again for zoom. Keep the scroll to zoom
   though." `web/src/components/Lightbox.tsx`: a click on the picture
   toggles between fit and 100 percent, and a drag that ends is also a
   click, so panning snaps the zoom. Make it behave like Discord's viewer
   plus our zoom: scroll zooms around the pointer (keep), drag pans when
   zoomed (keep), a click on the picture does nothing, a click on the dark
   area around it closes, double-click returns to fit. Keep the keys and
   the Copy and Save buttons.
4. **Volume from the voice channel.** "When in a voice channel you should
   be able to click on other people in that channel and adjust their
   volume from there." It half exists: clicking a name under a voice
   channel in `ChannelSidebar.tsx` opens the profile card, which has a
   slider only when you share the call (`sameCall` in `ProfileCard.tsx`),
   and the tiles in `VoicePanel.tsx` have one. Wes did not find it, so
   first check that the card's slider actually appears when both people
   are in the same channel call (and a DM call); fix it if not. Then add
   what Discord has: right-click a person under a voice channel, or their
   tile, for a small menu with their volume slider (0 to 200 percent, same
   `voicePrefs.setVolumeFor`) and "Mute for me". Use the existing `Menu`
   component. Not on yourself.

## Not in this job

The emoji picker itself (another brief), screen-share UI (another brief).
