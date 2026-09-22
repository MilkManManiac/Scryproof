# Bookmarks

Read `docs/briefs/README.md` first. Sonnet-sized, small.

## The job

Save a message for yourself and find it again. A bookmark is private:
nobody else knows. The hover menu on a message gets "Save", and the
inbox (the component that renders `Notice`s from `web/src/lib/notices.ts`;
find it by its "Notifications" title) gets a second tab, "Saved",
listing them newest first. Each one jumps to the message the way search
hits and pins do (`jump-to-message.md` built that; reuse its hook).

## Server

- Schema: `bookmarks` (`user_id`, `message_id`, `created_at`, primary
  key on the pair, cascade on message delete). One migration.
- Routes: `PUT /api/messages/:messageId/bookmark`, `DELETE` the same,
  `GET /api/bookmarks` returning the messages (same shape as a channel's
  message list, plus `serverId` and `channelName` so the list can say
  where each one is) for channels the caller can still view. A message
  in a channel they lost access to is skipped, not 404ed.
- No gateway event: a bookmark changes on one device by one person's
  click; the list refetches when opened.
- Test: the visibility filter.

## Client

- `Message` gains `bookmarked?: boolean`, filled in the read path per
  viewer (the way reactions carry `me`).
- `MessageList.tsx` hover menu: "Save" / "Unsave". A saved message shows
  a small mark beside the time, `title="Saved"`.
- The Saved tab: fetch on open, rows of author, channel, first line,
  time; click jumps. Empty state: "Nothing saved. Hover a message and
  pick Save."
- DMs: out of scope (the server cannot read them to list them); do not
  add the menu item there.
