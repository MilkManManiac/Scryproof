# /roll

Read `docs/briefs/README.md` first.

## The job

This is a D&D table. Typing `/roll 2d6+3` (or `/r 2d6+3`, or `/roll d20`)
and pressing Enter sends a message the room can trust: the server rolls,
not the client, and the result is stored as a message everyone sees the
same way, in the roller's name, with the dice shown.

## Server

- Parsing and rolling in `shared/src/dice.ts` (pure, tested):
  `parseRoll(text)` accepts `NdS`, `dS`, `+`/`-` modifiers, several terms
  (`2d6+1d4-1`), `adv`/`dis` shorthand for `2d20` keep highest/lowest, and
  keep-highest `4d6kh3`. Limits: 100 dice, sides 2 to 1000. Returns a
  structure or a plain-English error ("That is not a roll I understand.
  Try 2d6+3."). `roll(parsed, random)` takes a random function so the test
  can fix it. Total, and each die's face, are in the result.
- Randomness: `crypto.randomInt` in `server/src/lib/crypto.ts` or the
  same module's style. Never `Math.random` for this.
- In `POST /api/channels/:channelId/messages`
  (`server/src/routes/messages.ts`): a body starting with `/roll ` or
  `/r ` is rolled on the server and stored as a message whose `content` is
  the roll written out, e.g. `🎲 2d6+3 = **11** (4, 4) + 3`, but see
  below about markup: the client has no bold, so store
  `2d6+3 → 11  [4, 4] +3` and add a `kind: 'roll'` field on the message
  (schema column `kind text`, default `'text'`, migration) so the client
  can draw it with a dice mark of its own instead of an emoji in the text.
  A bad roll is refused with the parse error (400) and nothing is sent.
  Same permissions as any message.
- Tests: `server/src/tests/dice.test.ts` for the parser and roller with a
  fixed random; one route-level case if the existing message tests make
  that cheap.

## Client

- The composer sends the text unchanged; the server decides. Typing `/`
  at the start could hint "/roll 2d6+3" as a placeholder; keep it to that.
- `MessageList.tsx`: a message with `kind === 'roll'` is drawn in a roll
  style: the expression, the big total, the faces small. Edit is refused
  for rolls (server too: a roll is not editable, 400 "A roll cannot be
  edited.").
- The reply/notice preview (`toPlainLine`) shows the content as stored.

## Files

- `shared/src/dice.ts` + test, `server/src/db/schema.ts`, `server/drizzle/`,
  `server/src/routes/messages.ts`, `services/serialize.ts`, `shared/src/types.ts`
- `web/src/components/MessageList.tsx`, `Composer.tsx`, `styles.css`

## Not the job

Other slash commands. Rolling in DMs. Private rolls.
