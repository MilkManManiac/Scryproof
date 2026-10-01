# Notifications rebuild

Read `docs/briefs/README.md` first, then this. Written 2026-10-01 by the main
session from two rounds of notes from Wes and a friend of his. Opus-sized:
six steps, all built and reviewed before any of it deploys. **Nothing here
deploys on its own. Wes decides when it ships, and the main session runs the
release.**

## What is wrong today, in Wes's and his friend's words

- "I keep hearing notifications but I don't know where they're coming from."
- "Maybe the user can see a general screen of all messages that have occurred
  that link back to their respective chat."
- "An unread message counter next to channels."
- "A little popup that would fade after a while… you should be able to select
  in those notifications settings what types of messages pop up… have
  pictures and previews of what it could look like."
- "Right click a channel and hit like show popups."
- The bell timeline "is extremely simplified and honestly doesn't really
  provide that much value… maybe it does a better job at summarizing."
- "Allow each user to be very specific about what they want to hear and see."
- Big updates should get a short tour, "show them what's new and how to get
  there and how it works," skippable like the first-run walkthrough.

## Why the sound comes from nowhere (verified in code)

`web/src/lib/notify.ts` `soundFor`: the default `message: 'unfocused'` plays
the message tone for **every** channel message anywhere when the window is not
focused. `web/src/lib/notices.ts` `noticeFor`: the bell lists only things
`addressedToMe` (mentions, @everyone, roles) plus DMs and event reminders. So
a plain message dings and leaves no trace except a bold channel name
somewhere in some server. Fix the list, not the sound.

There is no in-app pop-up. The only pop-up is the operating system's
`Notification`, off by default, mentions/DMs/events only, unfocused only.

## The code you will touch

- `web/src/lib/notify.ts`: `NotifyPrefs`, `soundFor`, `isMuted`, `tones`,
  `play`. Prefs in localStorage `scryproof.notify.v1`.
- `web/src/lib/notices.ts`: `Notice`, `noticeFor`, the on-device list
  (localStorage `scryproof.notices.v1.<userId>`, keeps 200), OS pop-up.
- `web/src/components/NoticeTimeline.tsx`: bell + list + Saved tab.
- `web/src/components/NotifySettings.tsx`: the settings modal.
- `web/src/components/ChannelSidebar.tsx`: bold/badge via `unreadFor`
  (`state/store.tsx` ~line 1715), right-click menu (mute/unmute) ~line 275.
- `web/src/state/store.tsx` ~line 1046: `message_create` handling, where
  `soundFor` and `noticeFor` are called. `state/dms.tsx` ~line 680 does the
  same for `dm_message_create`.
- `web/src/lib/voice-audio.ts` ~line 417: join/leave/mute/unmute chimes,
  sine tones, no files.
- `web/src/components/Walkthrough.tsx` + `lib/walkthrough.ts`: the first-run
  tour (`STEPS`, cards with a `target` selector). `WhatsNew.tsx` `NewsCard`.
- Server read state: `server/src/services/read-state.ts`, `read_state_update`
  event. `readStates[channelId] = { lastReadMessageId, mentionCount }`. There
  is no per-channel unread *count* today, only "last read" and mention count.
- Gateway events (`shared/src/gateway.ts`): `message_create`,
  `dm_message_create`, `event_reminder`, `voice_state`/`voice_state_update`
  (find the screen-share flag for went-live/stream-ended), `voice_membership`
  (joined/left a call), `game_done`, `purdle_done`, `cuntections_done`.

Rules that bind all of this: nothing about what you saw or read leaves the
device except the read state that already does (rule 1, and the comment at
the top of `notices.ts`). DM text is end-to-end encrypted: it may be shown
inside the app where it is already decrypted, never in the OS pop-up and
never written to the notices list in plain storage (rule 8).

## Step 1: the bell summarizes what happened while you were away

- Every arrival that makes a sound or marks unread is recorded, not just
  mentions. Record per channel burst, not per message: one `Notice` of a new
  kind `'activity'` per channel, updated in place (count, distinct author
  names up to three, last message id, first unseen message id). Mentions and
  DMs stay as their own rows as now.
- Top of the list, a digest line: "Since you left: 3 DMs, 2 mentions, 41
  messages in 4 channels." "Since you left" means since the window last lost
  focus or the app was last closed; store that moment.
- Rows grouped by place, busiest first within a day. A channel row reads
  "lamp, Forg and 2 others · 14 in #general" and jumps to the first unseen
  message (reuse `flashWhenThere` / `jumpToMessage`). Opening a channel
  marks its row read (`readWhere` already does this for mentions).
- Keep the server filter row. Keep the Saved tab untouched.
- Pure functions (`withNotice`, a new `summarize(list, since)`) get unit
  tests in `web/src/tests/notices.test.ts`.

## Step 2: unread counts in the sidebar

- Number beside each text channel, total on each server icon in the rail.
  Mention badge stays red and on top.
- Source: the server's read state gives last-read; the count has to come from
  somewhere. Cheapest honest option: server adds `unreadCount` to
  `readStates` (count messages with id > lastReadMessageId, capped at 99,
  per channel, computed in `readStatesFor` and on `message_create` fan-out).
  If that query is too heavy on a busy channel, cap at 99 with `LIMIT 100`.
  Do not count on the client from the local message cache: it only holds
  what has been scrolled.
- Server test for the count. Client: `unreadFor` returns the number.

## Step 3: per-person, per-place control (the settings rebuild)

Replace the middle of `NotifySettings.tsx` with two layers.

**Defaults, one row per moment.** Moments: direct message, mention (name,
@everyone, your role), message in a channel, someone joins your call, someone
leaves, someone goes live, stream ends, event starting, game finished (the
dailies). Each row: a sound dropdown (the current tone or none for now; see
step 5) with "Hear it", a pop-up toggle, and for the two message rows a
"when" choice (never / when I'm somewhere else / always), which is today's
`MessageSound`.

**Per channel and per server, from right-click.** Four states: Follow
defaults, Watch (sound and pop-up on every message, regardless of focus),
Quiet (counts and lists, no sound, no pop-up), Mute (nothing, as today).
A watched channel shows a small eye after its name in the sidebar. A
server-level choice applies to its channels unless a channel overrides.
Settings lists every override with an Undo, replacing the "Muted" section.

Prefs stay in `scryproof.notify.v1` with a migration from the old shape
(`mutedServers`/`mutedChannels` become `overrides: Record<id, 'watch' |
'quiet' | 'mute'>`). `load()` already tolerates old blobs; extend it and
test the migration in `web/src/tests/notify.test.ts`.

`soundFor` and `noticeFor` take the resolved per-place state and the moment
defaults. Keep them pure; the tests are the spec.

## Step 4: the in-app pop-up card

- A card bottom right (above the voice panel if one is showing), fades after
  about six seconds, hover holds it, click jumps to the thing and marks it
  read, a small close. At most three stacked; a fourth replaces the oldest.
  Same look on the phone layout, bottom of the screen.
- Shows for whatever step 3 says pops up. Independent of the OS pop-up,
  which keeps its existing toggle and stays unfocused-only.
- Three detail levels, one setting, each drawn live beside its radio as a
  real card with fake content, so the example always matches the app:
  1. who only: "lamp sent you a message" / "lamp mentioned you"
  2. who and where: "lamp in #general"
  3. who, where and the first line of what
- DMs: the in-app card may show the first line at level 3 because it is
  rendered from the decrypted message in memory. It must not go into the
  notices list (plain storage) and the OS pop-up stays name-only. Say this
  in the settings next to the level picker in one sentence.

## Step 5: the sounds

Wes may make clips in FL Studio (WAV, under half a second for message/DM/
mute/unmute/viewer-joined, under a second for mention/joined/left/
went-live/stream-ended/game-finished, ring 1.5 to 2 s looping). They will
arrive in `C:\Users\weshu\Documents\Scryproof-keep\sounds\`. When they do:
convert to 48 kHz mono OGG or MP3, loudness-match, ship them in
`web/public/sounds/`, and make the step 3 dropdowns list them by name with
the current tone kept as "Classic". Until they arrive, build the dropdown
with only the tones so the wiring is done. Do not design sounds yourself;
two rounds of that have failed his ear.

## Step 6: "Show me" on the What's new card

- `NewsCard` gets a second button, "Show me", when the newest release
  declares a tour. Add an optional `tour?: Step[]` to a changelog entry (or a
  map from release id to steps) and reuse the `Walkthrough` card renderer
  with those steps instead of `STEPS`. Skippable by click-off, Escape, or
  Skip, exactly like the first-run one. Opening it marks the release read.
- This release's tour, three cards: the bell ("everything that made a noise,
  summarized"), right-click a channel ("Watch, Quiet, Mute"), the settings
  ("pick what you hear and see, per moment").
- Only releases that add something you have to find get a tour. Small
  fixes stay as the text list.

## Order and shipping

Build 1 and 2 together (shared data), then 3 and 4 together (the settings
describe the card), then 5's wiring, then 6. One worktree, one branch, one
commit per step with a sentence subject. After each step a screenshot in the
report so Wes can look. Everything is reviewed as a whole before anything
deploys; the main session does the release.

## Known hazards

- The main tree has an uncommitted role-mentions WIP (another session) that
  touches `notify.ts`, `NotifySettings.tsx`, `store.tsx`, `changelog.ts`.
  Work in a worktree off committed `main`. Whoever merges second resolves.
  Do not stash, pop, or commit anything in the main tree.
- Files are CRLF. Any scripted edit must preserve line endings.
- Changelog entry goes at the top of `web/src/changelog.ts`, dated the day
  it ships (release.sh refuses otherwise). Write it last.
- Freedom units: anything shown to a person uses miles, feet, pounds.
- No new dependencies. No emoji, no decorative icons (the eye for Watch is a
  one-line inline SVG, like the bell).
- `npm test`, `npm run typecheck`, `npm run build` must pass. Do not run the
  dev server or smoke tests; they share ports with the main session.
