# Jump to any message, however old

Read `docs/briefs/README.md` first.

## The problem

`jumpTo(messageId)` in `web/src/components/MessageList.tsx` looks for
`#message-<id>` in the DOM and gives up quietly when it is not there. The
store only holds the newest 50 messages of a channel plus whatever scrolling
up has loaded (`loadMessages` in `web/src/state/store.tsx`, `before` paging
through `GET /api/channels/:channelId/messages`). So a pinned message or a
search hit from last week scrolls to nothing. `PinnedMessages.tsx` and
`SearchResults.tsx` both call `jumpTo`.

## The job

Make a jump land every time.

Server: the messages route already takes `before` and `after`. Add
`around=<messageId>`: the 25 messages up to and including that id and the
25 after it, in the usual order, same permission checks, same `hydrate`.
Reject `around` combined with `before` or `after`.

Client: a store action `jumpToMessage(channelId, messageId)`:

1. If the message is already in the store's list for that channel, just
   scroll and flash (what `jumpTo` does now).
2. Otherwise fetch `around` and **replace** that channel's loaded list with
   the result, marking it as a window that is not at the bottom. Scrolling
   down from a window must load newer messages (`after` paging; check
   whether the list only pages upward today and add the downward case),
   and a new message arriving on the gateway must not be spliced into a
   window that does not reach the bottom (drop it and let the "newer
   messages" load catch it, or show a "Jump to present" pill; pick the
   simpler one and say which).
3. Then scroll and flash.

`PinnedMessages.tsx` and `SearchResults.tsx` call the new action instead of
`jumpTo`; delete the "Older than what is loaded" wording in pins.

The "jump to present" behaviour must also cover switching channels: leaving
a channel while in a window and coming back must show the bottom again, as
now.

## Files

- `server/src/routes/messages.ts`
- `web/src/state/store.tsx`, `web/src/components/MessageList.tsx`,
  `PinnedMessages.tsx`, `SearchResults.tsx`, `web/src/lib/api.ts`
- Unit test for the reducer change if the store has tests
  (`grep -rn store web/src/tests`); if it does not, say so.

## Not the job

DMs. Changing page size. Infinite scroll polish.
