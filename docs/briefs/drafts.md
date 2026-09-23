# Drafts survive a channel switch

Read `docs/briefs/README.md` first. Sonnet.

Loaf asked for it. Today `web/src/components/Composer.tsx` (around line
181, "A fresh draft per channel") empties the box on every `channel.id`
change, so half a message is lost by clicking another channel.

## The job

- Keep the unsent text per channel, in memory only, for as long as the
  app is open. Switching away and back puts it back, cursor at the end.
  Sending clears that channel's draft. A reply in progress (`replyingTo`)
  may be dropped; say in the report what you did.
- The same for direct messages: the DM composer in
  `web/src/components/DirectMessages.tsx`, per conversation.
- **Not written to disk.** No localStorage, no IndexedDB. A DM draft on
  disk would be the plaintext of an encrypted conversation, and the ask
  was "until you close the app". Say so in a comment.
- Pending attachments are not kept (they are uploads in flight); only
  text.
- A channel with a draft may show a small pencil mark in the sidebar, but
  only if it is a few lines; otherwise leave it out.
- The draft store is a small module in `web/src/lib/` with a unit test.

## Not in this job

Syncing drafts between devices. The DM list header (another brief adds a
"+" there).
