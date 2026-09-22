# Polls

Read `docs/briefs/README.md` first. Sonnet-sized: one migration, one
route file, one message kind, one component. Follow `roll.md` and the
code it produced (`kind === 'roll'` in `server/src/routes/messages.ts`
and `web/src/components/MessageList.tsx`); a poll is the same shape with
votes attached.

## The job

This is a D&D group that spends half its chat deciding when to play.
`/poll Which night? | Friday | Saturday | Sunday` sends a message the room
votes on by clicking. Everyone sees the counts change live. The author
(or anyone with Manage messages) can close it; a closed poll keeps its
result and takes no more votes. Multiple choice is a switch on the
command: `/poll* ...` allows more than one pick (the star is easy to
type; do not invent a flag syntax).

## Server

- Schema (`server/src/db/schema.ts`): `messages.kind` gains `'poll'`.
  New table `poll_votes` (`message_id`, `user_id`, `option` smallint,
  primary key on all three, cascade on message delete). The poll itself
  lives in a new nullable `messages.poll` jsonb column:
  `{ question, options: string[], multiple: boolean, closedAt: string | null }`.
  One migration via `npm run db:generate`; see the README note about
  `server/drizzle/meta/_journal.json`.
- `POST /api/channels/:channelId/messages`: a body matching
  `^/poll(\*)?\s+(.+)$` is split on `|`, trimmed. Question 1 to 200
  characters, 2 to 10 options of 1 to 80 characters each. Refuse with a
  plain sentence otherwise ("A poll needs a question and at least two
  choices, separated by |."). Stored `content` is the question, so search
  and notifications keep working; `kind` is `'poll'`; `poll` holds the
  rest. Same permissions as any message.
- `PUT /api/messages/:messageId/votes` with `{ options: number[] }`:
  replaces the caller's votes (empty array clears). One option unless
  `multiple`. Refused when closed or when the caller cannot view the
  channel. `POST /api/messages/:messageId/close`: author or Manage
  messages. Both fan out `message_update` with the message carrying
  fresh counts.
- `Message` (`shared/src/types.ts`) gains
  `poll?: { question, options, multiple, closedAt, counts: number[], mine: number[] }`.
  `mine` is per viewer, so build it in the read path the way reactions
  carry `me`; find how reactions are assembled onto messages and do the
  same.
- Tests: parsing in `server/src/tests/polls.test.ts` (good input, bad
  input, the star), and a vote round-trip if the message tests make that
  cheap.

## Client

- `Composer.tsx` already lists commands from `web/src/lib/commands.ts`;
  add `/poll` to `commandOffers` with the note "ask the room:
  /poll Which night? | Friday | Saturday". Nothing else in the composer.
- `MessageList.tsx`: a `kind === 'poll'` message draws the question in
  bold, then one row per option: a button with the option text, a bar
  whose width is that option's share, and the count. Your own pick is
  marked. Clicking votes (or unvotes). Under it, "Open" or "Closed", and
  a Close link for whoever may. No edit for polls; delete works as for
  any message.
- Keep it to `styles.css` additions in a new `/* polls */` section, using
  the existing tokens (`--panel-2`, `--accent`, `--text-dim`).
- DMs are out of scope: a DM body is sealed and the server cannot count
  votes on it.

## Not in this job

Timed closing, anonymous polls, changing options after posting.
