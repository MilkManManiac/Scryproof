# Message search in a server

Read `docs/briefs/README.md` first.

## The job

A box in the channel header. Type, press Enter, get the messages in this
server that contain those words, newest first, in a panel where the member
list is (look at how `PinnedMessages.tsx` opens and draws; do it the same
way). Click a result to go to that channel and that message.

## Server

New route in `server/src/routes/messages.ts`:
`GET /api/servers/:serverId/search?q=...&before=...`.

- `q`: 2 to 100 characters, validated with Zod like the other routes.
- The caller must be a member (`requireMember`). Only channels where they
  have `VIEW_CHANNEL` and `READ_MESSAGE_HISTORY` are searched: use
  `computePermissionsForServerChannels` in
  `server/src/services/permissions.ts` to get the list of channel ids first,
  then query only those. This is the whole point: a search must never show
  a message from a channel the person cannot open. Add a unit test in
  `server/src/tests/` for that filtering if the existing tests give you a
  way to build the context (see `permissions.test.ts`); if they do not,
  say so in the report.
- Match: case-insensitive `ILIKE '%word%'` on `messages.content`, every word
  must match, deleted messages excluded, 25 per page, `before` is a message
  id for the next page (ids are uuidv7, so they order by time).
- Serialize with the same `serialize.message` the message list uses, plus
  `channelId`. No new shape.
- Rate limit like the other read routes (see `server/src/lib/rate-limit.ts`
  and how routes use it).

DMs are encrypted end to end and the server cannot read them; they are not
searched here and must not be. Say so in a comment at the route.

## Client

- `web/src/lib/api.ts`: `api.messages.search(serverId, q, before?)`.
- New `web/src/components/SearchResults.tsx`: the panel. Each row: channel
  name, author (use `nameOf` from `web/src/lib/mentions.ts`), time, the
  message as one line (`toPlainLine`), the matched words bold. Empty
  state: "Nothing in this server says that." Loading state. "More" at the
  bottom while there are more.
- The box: in the channel header where the pin button lives
  (`grep -rn PinnedMessages web/src` to find the header). Escape clears and
  closes. Ctrl+F opens it: look at `web/src/lib/shortcuts.ts` and
  `ShortcutHelp.tsx` so the help lists it.
- Clicking a result: select that channel, then scroll to and briefly
  highlight the message. `MessageList.tsx` already jumps to a message for
  replies and pins; use whatever it uses.
- Styles in `web/src/styles.css`, matching the pinned panel.

## Files

- `server/src/routes/messages.ts`, `server/src/tests/`
- `web/src/lib/api.ts`, `web/src/components/SearchResults.tsx`,
  the header component, `web/src/lib/shortcuts.ts`,
  `web/src/components/ShortcutHelp.tsx`, `web/src/styles.css`

## Not the job

Full-text indexes (a `tsvector` column is a later step; `ILIKE` is fine at
this size). Searching DMs. Filters like `from:` or `in:`.
