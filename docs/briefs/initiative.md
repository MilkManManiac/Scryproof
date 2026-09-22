# The initiative tracker

Read `docs/briefs/README.md` first. **Opus**, because it is a small
live-state system, not a message: order, turns, rounds, seen the same by
everyone in the channel and changed by anyone the DM allows.

## The job

`/init` in a text channel opens the tracker for that channel: a panel
above the composer with the combatants, an initiative number each,
whose turn it is, and the round. Anyone can add themselves ("Add me",
which takes a name and a number, or rolls `d20+mod` on the server the
way `/roll` does). Whoever started it, or anyone with Manage messages,
can add anyone, remove, reorder, go to the next turn, and end it.
Everyone in the channel sees the same thing within a second. One tracker
per channel at a time.

## Server

- Schema: `trackers` (`channel_id` primary key, `started_by`, `round`,
  `turn` index, `entries` jsonb `[{ id, name, userId | null, initiative, note }]`,
  `updated_at`). One migration. No history.
- Routes in `server/src/routes/trackers.ts`: get for a channel, start,
  add entry (`{ name, initiative } | { name, roll: 'd20+3' }`, rolled
  with the dice code `/roll` uses), remove, set entries (reorder), next
  turn, end. Every change fans out `tracker_update` with the whole row
  to the channel's viewers. Rules on the server: self-add for anyone who
  can send messages; the rest for the starter or Manage messages.
- When a tracker starts and ends, post a plain message in the channel
  in the actor's name ("Initiative started", "Initiative ended after 4
  rounds"), so history shows the fight happened.

## Client

- `web/src/components/Initiative.tsx`, mounted in the channel view above
  the composer when the store has a tracker for the selected channel.
  A compact bar by default (round, whose turn, a Next button, expand)
  and the full list when expanded. The current turn is highlighted; a
  combatant who is a member shows their avatar.
- `commandOffers` in `web/src/lib/commands.ts` gets `/init`; the
  composer sends it to a small handler that calls the start route
  instead of posting a message. That makes it the one command the client
  acts on rather than sends; say so in a comment next to `spawnOf`.
- Store: `trackers[channelId]` from a fetch on channel select and the
  gateway case.

## Tests

Next-turn and round arithmetic as a pure function in
`shared/src/initiative.ts`, tested in `server/src/tests/initiative.test.ts`.

## Not in this job

Hit points, conditions, monsters from a book, a map.
