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
brief: the microphone already goes through a Web Audio graph in
`web/src/lib/voice-audio.ts` before LiveKit, so a pitch shift or a robot
voice is a node in that graph, chosen in Voice settings, and the E2EE path
is untouched because the effect is applied before encryption. Preview in
the settings meter so the person hears themselves first.
