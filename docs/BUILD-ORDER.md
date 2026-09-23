# Build order, written 2026-09-22 late

For the next session (Opus). Wes: "come up with build order and then I'm
just gonna straight up switch models." Read `CLAUDE.md`, the `milk-project`
skill and `docs/HANDOFF.md` (last two sections) first. The big one shipped
2026-09-23 00:44 ET, client 1790124190233. Everything below is unbuilt.

Where each item came from: the group's #ideas-suggestions channel on
Discord (screenshots 2026-09-22 22:16), Wes's own asks, and the gaps the
security page in that channel admits to. Facts about the code were
checked against main at `229709b`.

Rules that do not move: no deploy without Wes saying ship; agents follow
`docs/briefs/README.md` (own worktree, no dev server or smoke tests, no
push, no HANDOFF edits); one migration per branch and renumber on merge
with `npm run db:generate`; `bash scripts/release.sh` ships and needs a
changelog entry dated today in `web/src/changelog.ts`.

## Session A: the main session, alone, on the box

Nothing here has a screen. Do these first and by hand.

1. **Backups.** DONE 2026-09-23, live, restore proven (HANDOFF, last
   section). Was: there are none. Nightly `pg_dump` plus the attachments
   directory, encrypted on the box with a key that only Wes's PC can open
   (age or gpg public key; the private half never on the box), then copied
   off. Simplest honest target: Wes's PC pulls it over ssh with the existing
   `.env.box` key, or restic to an object store with the outbound firewall
   rule already allowed for it (`infra/box/remote/40-firewall.sh`). Prove a
   restore once, on the PC, before calling it done. Write the restore steps
   into `infra/box/README.md`. Non-negotiables 1 and 8 apply: the backup
   holds channel text, which the server can read anyway, and DM ciphertext,
   which stays ciphertext.
2. **Password reset, the box command.** BUILT `fc25098`, ships with the
   next deploy. `server/src/routes/auth.ts` has
   change-password only. Add a script the main session runs over ssh
   (pattern: `scripts/box.sh`) that sets a temporary password for a
   username, revokes every session, and marks the account "must change
   password". On next login the app forces a new password before anything
   else. Log it. No email, ever.

## Session B: one batch of agents, briefs in `docs/briefs/`

Launched 2026-09-23 03:00 ET, seven briefs: `screen-share.md` (3 and 4,
Opus), `speaking-ring.md` (7), `drafts.md` (5), `desktop-menu.md` (6),
`people.md` (8, 9 and the card volume from 12), `account.md` (11),
`small-wants.md` (the rest of 12). The two-screens check was added to
`test:voice` first and passes in Chrome; the live logs put the failure
in the desktop app (see `screen-share.md`).

Write the briefs the way the last two batches were written (see
`polls.md` and `events.md` for the shape). Sonnet for the small ones,
Opus for the two voice ones. Merge, run `npm test`, `npm run typecheck`,
`npm run build`, `npm run test:voice`, take shots, write HANDOFF, wait for
Wes to try screen share with his brother, then ship.

3. **Screen share, two at once.** Wes and his brother tried and "it did not
   work". The code intends it: `VoicePanel.tsx` shows one big video and
   other screens as tiles, newest share takes the big spot; the grant in
   `server/src/routes/voice.ts` allows `screen_share` for anyone with
   SHARE_SCREEN. So it is a bug with no repro yet. First step: extend
   `npm run test:voice` so two of the three fake browsers share at once and
   the third sees both. Fix whatever that finds. Ask Wes what each of them
   saw if the test passes.
4. **Screen share, the controls.** A sound on/off choice when starting a
   share (today `setScreenShare` in `voice-session.ts` always asks for
   audio), a volume slider on the stream you are watching (separate from
   the person's voice volume), and "hide their camera for me" on a video
   tile. All local; nothing on the server.
5. **Drafts survive a channel switch.** `Composer.tsx` around line 181
   wipes the text on every `channel.id` change. Keep a draft per channel in
   memory (and per DM in `DirectMessages.tsx`), restore on return, clear on
   send. Not persisted to disk: an unsent DM draft written to disk would
   be plaintext, and the ask was "until you close the app".
6. **Desktop right-click menu.** The Electron shell has no context menu at
   all (`desktop/src/main.js` only has the tray one), so misspellings get a
   red line and no suggestions. Add one: spelling suggestions, add to
   dictionary, cut, copy, paste, copy image, copy link. Covers three asks
   (TheSilentOne spelling, milky copy/paste, milky right-click images).
7. **Speaking ring lag.** milky: "check on lag on the light up circle for
   when someone is talking". Find where the ring is driven (LiveKit
   `isSpeaking` events vs the local meter) and measure before changing
   anything. If it is LiveKit's speaking detection, drive the ring from the
   decoded audio level with a short hold instead.
8. **Profile card not closing on outside click.** `ProfileCard.tsx` does
   close on `mousedown` outside its box, so something eats the event.
   Reproduce with `scripts/shot.mjs` by opening the card and clicking the
   voice panel, the member list, and the message list. Fix the one that
   fails.
9. **Nicknames just for you.** Wes: "let each person rename someone even if
   it's just on their end". A per-device map userId to label in
   localStorage, set from the profile card ("Call them..."), shown
   everywhere `nameOf` / `member.nickname ?? displayName` is used: member
   list, messages, voice panel, mentions, DMs. Server nicknames (which
   exist, `PUT /api/servers/:id/members/:id/nickname`) stay as they are;
   a local name wins over both.
10. **Global push-to-talk.** WRONG, struck 2026-09-23: it exists
    (`desktop/src/push-to-talk.js`, `uiohook-napi`, commit 197c3c0). Was:
    `desktop/src/main.js` has no `globalShortcut`. Register the key from
    voice settings in the main process, forward down/up to the renderer
    over the preload bridge, and gate the mic with the existing
    `MicGate` in `voice-audio.ts`. Browser stays window-focused, and the
    settings row says so.
11. **Two-factor, the switch.** Brief `account.md`, which also adds
    changing your password: the app had no screen for that either. The server has begin/complete/disable
    routes in `auth.ts` and `services/totp.ts`, the login screen already
    asks for the code, and there is no settings page. Add one under the
    account settings: QR (draw it locally, no CDN), confirm a code, show
    the recovery codes once. Turning it off asks for the password.
12. **The small wants, one brief.** A "+" at the top of Direct messages
    that lists people from your servers to start a DM (today you click a
    name in a member list). Volume slider on the profile card for people
    in voice. Interface scale in settings (a root font-size step, 90 to
    130 percent, remembered on the device). Make the four style buttons
    under the box more visible (Wes did not notice them). Add the pregnant
    man emoji to the list.

## Session C: main session, after B ships

13. **Electron fuses and shell updates.** Run-as-node off, node options
    off, cookie encryption on, ASAR integrity on. Then updating the shell
    itself, not only the client. `docs/HANDOFF.md` "Desktop app updates
    itself" has the client half.
14. **Group DMs and DM calls.** Briefs exist: `docs/briefs/group-dms.md`
    and `dm-calls.md`. Re-read them against the current DM code before
    handing them out; the recovery phrase and vouching landed after they
    were written.
15. **Channel deletion on Lamp's server.** Probably a missing
    MANAGE_CHANNELS on his role. Confirm with him before building anything.

15b. **A full emoji picker.** Wes, 2026-09-23: "pregnant man emoji isn't
    in". It is, but only by typing `:pregnant_man:`: the picker
    (`ReactionPicker.tsx`) is 32 chosen emoji plus recents, and the long
    list in `lib/emoji.ts` has no screen. Add a search box to the picker
    that searches `SHORTCODES` by name. Small; low priority per Wes.

## Session D: its own long session

16. **End-to-end encrypted channels (M7).** Schema and wire format exist
    (`messages.ciphertext`, `channels.encrypted`, key epochs); the
    identity keys from voice and the pairwise wrapping from
    `dm-crypto.ts` are the building blocks. Search, pins and the
    initiative tracker will not work in an encrypted channel and the UI
    has to say so. Last item on the security page. Read GAMEPLAN section
    1b first.
17. **The UI pass.** Waiting on Wes's screenshots. Read
    `references/the-wall.md` in the milk-project skill before starting.

## Already done, so off the list

Private channel switch on create (exists). Tray icon and start with
Windows (exist). Style buttons and keys in the composer (exist, see 12).
Server-side nicknames (exist, see 9). Scroll to newest on opening a
channel (exists; if Loaf still sees otherwise it is a bug, get a repro).

## Open for Wes

- Should @everyone get Manage events, so the whole group can plan?
- Backups: decided, to the PC (free). Wes still needs to put the private
  key file in the password manager.
