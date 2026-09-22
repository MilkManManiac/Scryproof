# Briefs for cheaper agents

Written 2026-09-22 by the main session. Each file here is one job for one
agent working in its own git worktree. The rules that made the last batch
(Zod, sweep, mute) work, kept verbatim:

- Read `CLAUDE.md` and the non-negotiables first. Then the brief. Then only
  the files the brief names, plus whatever they import.
- One job. Nothing outside the brief, however tempting. If the brief is wrong
  about the code, say so in the report and do the closest right thing.
- Match the code around you: comment density, naming, plain-English error
  messages, no emoji, no decorative anything. Comments explain *why*, in
  sentences.
- Permissions are computed on the server. The client only hides buttons.
- No new dependencies. No third-party service. Nothing that phones home.
- Tests: `npm test` (unit, server and web), `npm run typecheck`,
  `npm run build`. Do **not** run `scripts/dev-restart.sh`, `test:smoke`,
  `test:dm`, `test:desktop` or `npm run dev`: they share ports and a
  database with the main session. Integration is checked after merge.
- Commit on your worktree branch with a subject that is a sentence. Do not
  push. Do not touch `docs/HANDOFF.md`; the main session writes that.
- Report: the branch name, the commit hash, files changed, the exact output
  of the three commands above, and anything you were unsure of.

## The plan this batch comes from

What Wes asked to build (docs/discord-features.md) and what is still
missing, sorted by who should do it:

Cheaper agents, in parallel, this batch:

1. `search.md`: message search in a server.
2. `custom-emoji.md`: emoji a server uploads itself.
3. `spoilers.md`: `||hidden||` text, click to reveal.
4. `dm-file-sweep.md`: unclaimed DM uploads are swept like attachments.

Main session, in order, after this batch is merged and Wes has clicked
through it: Electron fuses; group DMs; soundboard; phone layout and push;
safety number. R2 stays flagged.

Second batch, written 2026-09-22 after the first merged and deployed, not
yet launched (the PC was low on memory at the time):

5. `jump-to-message.md`: pins and search hits land however old.
6. `timeout.md`: quiet a member for a while.
7. `block.md`: block a person.
8. `roll.md`: `/roll 2d6+3`, rolled on the server.

`jump-to-message` and `roll` both change `MessageList.tsx` and
`messages.ts`; `timeout`, `block` and `roll` each add a migration, so
`server/drizzle/meta/_journal.json` will conflict: merge one at a time and
keep every entry, renumbering the later migrations if two took the same
number.

Still later: bookmarks; polls; voice messages; **voice changers** (Wes,
2026-09-22: "nice to have"). Voice changers are a main-session job, not a
brief. Correction (2026-09-22, evening): the microphone does **not** go
through a Web Audio graph before LiveKit today. `MicGate` in
`web/src/lib/voice-audio.ts` listens on a clone of the track and flips the
real track's `enabled` flag; the real track goes to LiveKit untouched. So
a voice changer means opening the microphone ourselves, running it through
an effects chain (ring modulator for a robot; an AudioWorklet doing
granular pitch shift for chipmunk and deep), and publishing the chain's
output as the microphone track. Still before encryption, so E2EE is
untouched. Preview through the settings meter first. Roughly an afternoon,
the pitch shifter being most of it.

Two more main-session jobs, written up 2026-09-22 after lamp asked for
them: `group-dms.md` and `dm-calls.md`. Both change the E2EE path or how
voice rooms are granted, which is why they are not agent briefs.

## Third batch, written 2026-09-22 night, not yet launched

Wes: "We can do a big one next. What else can we build? Come up with a
plan and we can give to sonnet or opus to build." Everything from the
first two batches is live. Not deployed at the time of writing: commands
and emoji names in the DM box, and Delete channel on the right-click
menu (commit 59085e5); they go out with this batch.

Sonnet, in parallel, each in its own worktree:

9. `invite-link.md`: `/invite/CODE` opens a join screen. Smallest, and
   the first thing a new person hits.
10. `polls.md`: `/poll Which night? | Friday | Saturday`, voted by click.
11. `events.md`: "Coming up" in the sidebar with Going / Maybe / Can't
    and a reminder an hour before.
12. `bookmarks.md`: save a message for yourself; a Saved tab in the inbox.
13. `voice-messages.md`: hold to record, a waveform player in place.

Opus, one at a time after the Sonnet batch is merged (they share the
voice path and the store):

14. `soundboard.md`: real sounds a server uploads, played into the call
    as a second encrypted track.
15. `voice-changers.md`: Robot, Chipmunk, Deep, before the track is
    published.
16. `initiative.md`: `/init`, a live turn tracker above the composer.

Merge trap, same as the second batch: `polls`, `events`, `bookmarks`,
`soundboard` and `initiative` each add a migration, so
`server/drizzle/meta/_journal.json` conflicts. Merge one at a time,
keep every entry, renumber. `polls` and `bookmarks` both touch
`MessageList.tsx` and `messages.ts`; `polls` and `initiative` both add to
`commandOffers` in `web/src/lib/commands.ts`.

Main session only, still: group DMs, DM calls, Electron fuses, M7 (text
E2EE for private channels), the UI pass (waiting on Wes's screenshots).
