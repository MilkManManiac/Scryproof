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
15. **Channel deletion on Lamp's server.** CHECKED 2026-09-23, not a bug,
    nothing built. Read-only on the box: lamp owns "Superest Secretest
    Seahorse" (owner has every permission); its only other member is milky;
    neither has a role, and @everyone has no Manage channels. Until the
    release of 2026-09-23 00:44 ET there was no Delete anywhere in the UI
    (it came in 59085e5, right-click on a channel). So lamp can delete
    now; anyone else needs a role from him with Manage channels.

15b. **A full emoji picker.** Wes, 2026-09-23: "pregnant man emoji isn't
    in". It is, but only by typing `:pregnant_man:`: the picker
    (`ReactionPicker.tsx`) is 32 chosen emoji plus recents, and the long
    list in `lib/emoji.ts` has no screen. Add a search box to the picker
    that searches `SHORTCODES` by name. Small; low priority per Wes.
    DONE 2026-09-23: search shipped in batch five; the full scrolling
    picker (1,898 emoji, categories, skin tones) built, not deployed.

## Session D: its own long session

16. **End-to-end encrypted channels (M7).** ALL THREE STAGES LIVE
    2026-09-23 (the ciphertext proof on the box is still owed) (HANDOFF, last section; `docs/channel-e2ee.md`). Was: Schema and wire format exist
    (`messages.ciphertext`, `channels.encrypted`, key epochs); the
    identity keys from voice and the pairwise wrapping from
    `dm-crypto.ts` are the building blocks. Search, pins and the
    initiative tracker will not work in an encrypted channel and the UI
    has to say so. Last item on the security page. Read GAMEPLAN section
    1b first.
17. **The UI pass.** First round from Wes's screenshots done
    2026-09-23: the call made to look and act like Discord, full-width
    messages, pictures in call tiles, several streams at once, ringing
    (HANDOFF, "Calls like Discord"). Read
    `references/the-wall.md` in the milk-project skill before starting.

## Session E: what GAMEPLAN promised and nobody built (found 2026-09-23)

18. **Read the outbound firewall log.** Outbound is default deny
    (`infra/box/remote/40-firewall.sh`), but nobody has read a day of the
    blocked log. That log is the proof nothing on the box phones home
    (GAMEPLAN section 4). Read only; do it first.
   DONE 2026-09-23 (HANDOFF, last section): no connection the box started
   was ever blocked. But 80 and 443 out are open to anywhere, so the log
   cannot see HTTPS.
   18b. **Log new outbound 443/80 for a day** (`ufw allow log out`), then
   match every destination to apt, Let's Encrypt or fwupd. Box change; ask.
19. **Data export.** Any member downloads everything they posted as JSON;
    the owner exports the whole server (GAMEPLAN section 4, M8). Encrypted
    channels and DMs export as the member's device can read them, never
    through the server.
20. **Per-channel message expiry.** "Messages here last 30 days"
    (GAMEPLAN 1b finding 4, M8). Deleting deletes the row and the file.
   BUILT 2026-09-23, not shipped (HANDOFF, last section). Channels only.
21. **Monthly restore test, automated.** The restore was proven once by
    hand. Make it run monthly and show pass/fail in the admin panel.
22. **LiveKit key rotation** (quarterly) and **the monthly kernel reboot**
    (unlock after). A command for the first, a reminder for both.
23. **Wes and the group only:** a full D&D night on voice with nobody
    asking for Discord (M3 done-when), and Wes saying it doesn't feel like
    a clone (M5 done-when).

## Hearth on Scryproof: the plan for Monday 2026-09-28 (planned 2026-09-24, nothing built)

Wes, 2026-09-24: "work on a build plan/order for all this. I got my dnd on
Monday so I'd like to possibly have it ready by then. Don't build yet."

**The shape.**
- **The bot is an ordinary Scryproof account** called `hearth`, running
  inside Hearth on Wes's PC. It needs no server changes.
- **It never runs on the box**, because it holds members' voice keys
  (non-negotiables 8 and 9).
- **Hearth's Discord bot stays exactly as it is.** The new code sits beside
  it, so Discord is the fallback on the night.

**What the research found (2026-09-24):**
- **Players:** the group has never played a full night on Scryproof. Calls
  are proven with three people at most. That is Monday's biggest risk, more
  than the bot.
- **Music:**
  - Hearth already builds its mix in the renderer, at 48 kHz.
  - A WebRTC client in the same renderer can take the `master` node
    straight into a `MediaStreamDestination`, with no IPC or PCM chunks.
  - Scryproof's soundboard already publishes that kind of track, through
    the same encryption.
- **Encryption code:**
  - `web/src/lib/voice-crypto.ts` is pure WebCrypto with no imports, so it
    can be copied as-is.
  - `voice-key-provider.ts` needs only livekit-client.
  - `voice-session.ts` (1529 lines) is too tied to the web app, so the bot
    gets a lean session of its own.
- **Login:**
  - Send `POST /api/auth/login` with no Origin header and keep the cookie.
  - The gateway socket takes a `Cookie` header and no Origin.
  - The gateway lives in Hearth's main process (the `ws` package), because
    a renderer socket cannot set the cookie.
- **Approval:** a brand-new account is "first seen" on every member's
  device, so nobody has to approve it. The bot must keep its identity key
  forever, in Hearth's IndexedDB.
- **Rolls:** `POST /api/channels/:id/messages` with plain text into a
  plain (not encrypted) channel. Rate limit is 60 a minute.
- **Chronicler:** its WAV writer, file naming (`<startMs>-<user>.wav`) and
  manifest can be reused. The capture half is Discord-only and has to be
  rewritten. `transcribe-session.py` reads the file names, so those must
  stay the same.

**Build order.** Each step ends with something tested.

1. **Thu night, Wes (no code):**
   - Say ship for the three waiting commits.
   - Tell me who is playing Monday and whether each person has a Scryproof
     account and the desktop app.
   - Make the `hearth` account on scryproof.com, with no 2FA and a role
     with Connect and Speak, and a plain `#rolls` channel.
2. **Fri: the bot joins a call and is heard (the big one).** All in Hearth,
   all new files:
   - `src/main/scryproof.ts`: login, holding the gateway socket
     (heartbeat, reconnect), passing voice signals and membership to the
     renderer over IPC, and fetching the LiveKit token.
   - `src/renderer/scryproof/`:
     - `voice-crypto.ts` and `voice-key-provider.ts`, copied from Scryproof
       with a header naming the original. A check script fails if they
       drift.
     - A lean session of about 400 lines: announce, admit, wrap and rotate
       keys, handled strictly in order like the web's `inOrder`.
     - A LiveKit room with E2EE that publishes `master` as one track.
       Stereo at 128k, no echo or noise processing, DTX off, so music is
       not treated as speech.
   - Password stored with Electron `safeStorage`, not plain text like the
     Discord token.

   **Done when:** against local dev and local LiveKit, a browser member
   hears Hearth's music. A test like `test:voice` proves the frames decode
   with the right key and not with a wrong one. The connection panel on
   the member's side shows the bot.
3. **Sat, morning: rolls and the panel.**
   - Rolls go to Scryproof through the same `handleGameLog` fan-out.
     Same rules as Discord: DM-only rolls stay private, and it is paid tier
     only.
   - A Scryproof section beside the Discord panel: sign in, pick server and
     voice channel (remembered this time), Join, Leave, and a status line.
   - Nothing in `discord.ts` changes.
4. **Sat, afternoon: Wes on the real box, about 20 minutes.**
   - Wes installs the Hearth build, signs the bot in, and joins a channel
     from his own Scryproof.
   - He plays a scene and a roll. He should hear the music and see the roll
     in #rolls.
   - We read the connection panel together (non-negotiable 7).
5. **Sun: dry run with the group, 30 minutes, at least 4 people.**
   - Voice, music and rolls, with everyone reading their panel once, and
     someone leaving and rejoining mid-scene. Each leave or rejoin changes
     the keys, so music must survive it.
   - **Go or no-go that night.** No-go means Monday is on Discord as usual.
     Nothing is lost.
6. **Mon: play.** Discord stays open as the fallback. If Scryproof fails
   mid-session, everyone moves over and Hearth's Discord bot still works.

**After Monday, not for the 28th:**
- **The Chronicler on Scryproof:**
  - Take each member's decrypted track in the renderer.
  - A simple loudness gate with an 800 ms tail cuts it into clips.
  - Same WAV files, names and manifest as now.
  - The bot's name reads "Hearth (recording)" while it records, and it
    posts one line when it starts, so the call says someone is recording.
    Neither needs a server change.
  - Recordings already go to the campaign folder on Google Drive today, so
    Wes should decide whether they stay there.
  - About a day.
- **Rolls into encrypted channels:** skip. That needs the full device path.

**The cost on Monday if it goes ahead:** no Chronicler, so that session gets
no recording or transcript, unless Wes records on Discord in parallel, which
would mean two calls. Wes's call.

**The fallback that needs no code, if step 2 stalls:**
- Sign the `hearth` account into scryproof.com in a second browser profile
  on Wes's PC. Pick a virtual audio cable as its microphone, set it to
  always on, and turn noise suppression, echo cancellation and auto gain
  off.
- Route Hearth's output to the cable in Windows sound settings.
- The cost:
  - Mono at 48k.
  - Wes has to turn on "listen to this device" to hear it himself.
  - A driver install (VB-Cable) and Windows sound changes. Those are
    system changes, so Wes makes them or says yes first.

## Session F: the last one, when everything else is wrapped up

24. **The full review.** Wes, 2026-09-23: "an extremely thorough review of
    the project and everything involved. Make sure all is secure, clean,
    optimized, etc. Then I'll let some other devs review." Everything:
    server, web, desktop shell, box scripts, nginx, firewall, backups,
    dependencies, the crypto. Security first (GAMEPLAN 1b is the checklist
    to audit against), then dead code and cleanliness, then speed (the web
    bundle is 1.4 MB in one chunk). Then write a short guide for outside
    developers: what the project is, how to run it locally, the threat
    model, where the crypto lives, and what is known and accepted. Their
    findings come back as a list and get fixed like any batch.

25. **A tip link.** Wes, 2026-09-23: "something somewhere with my venmo
    profile so people can tip/pay me. Can be very simple." A plain link
    to his Venmo profile at the foot of settings, and once in What's
    new. No Venmo script, image or QR fetched by the app; the desktop app
    opens it in the default browser. Needs his @handle (ask). Before it
    ships, remind him to set Venmo's privacy to Private, since payments
    are public by default.

## Already done, so off the list

Private channel switch on create (exists). Tray icon and start with
Windows (exist). Style buttons and keys in the composer (exist, see 12).
Server-side nicknames (exist, see 9). Scroll to newest on opening a
channel (exists; if Loaf still sees otherwise it is a bug, get a repro).

## Nice to have (Wes's list, not scheduled)

- **Guest access** (Wes, 2026-09-23: "put in the nice to have something
  like guest access"). Someone without an account joins one call or one
  channel for a while, from a link Wes makes, and is gone after. Hard
  parts, to settle before building: a guest has no device identity, so
  the voice key exchange has to hold them at "needs your OK" like any
  unknown device, and the UI must name them as a guest everywhere; the
  link expires and can be revoked; a guest never sees history, members
  or other channels. Wes also closed server creation to everyone but him
  the same day ("keep it kinda secure"), so guests must not be a way
  round that.

## Open for Wes

- Should @everyone get Manage events, so the whole group can plan?
- Backups: decided, to the PC (free). Private key in Wes's password
  manager, done 2026-09-23.
