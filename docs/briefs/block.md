# Block a person

Read `docs/briefs/README.md` first.

## The job

You can block someone. After that, across every server you share: their
messages are collapsed to "Blocked message. Show." (click shows that one),
their reactions are not counted or shown to you, their mentions of you do
not ping you or count as unread mentions, and they cannot open or continue
a DM with you (they get "This person is not accepting messages from you",
you get nothing). Blocking is private: the blocked person is not told.

## Server

- Schema: table `blocks` (`userId`, `blockedId`, `createdAt`, primary key
  on the pair). Migration with `npm run db:generate`; commit SQL and
  `meta/`.
- Routes in `server/src/routes/profile.ts` (or a new `blocks.ts` registered
  in `app.ts`): `GET /api/blocks` (your list, ids and display names),
  `PUT /api/blocks/:userId`, `DELETE /api/blocks/:userId`. You cannot
  block yourself.
- DMs: in `server/src/routes/dms.ts`, opening a DM or sending into one is
  refused when either side has blocked the other (403, the wording above,
  and the blocker's own attempt is refused with "You have blocked this
  person."). Look at how a DM is opened and how a message is accepted.
- Mentions and pings: `server/src/services/mentions.ts` decides who is
  pinged; a blocked author never pings the blocker (`pingTargets`), and
  `bumpMentions` in `read-state.ts` follows the same rule. Test it in
  `mentions.test.ts`.
- The block list rides in the `ready` frame (find where the user's own
  profile is sent at connect in `server/src/gateway/`) so the client has it
  from the first paint, and the client updates it on its own PUT/DELETE.

## Client

- `web/src/lib/api.ts`: the three calls.
- Store: `blocks: Set<string>` on the signed-in user's state, loaded from
  `ready`.
- Message list: an author in the set draws as one collapsed row, "Blocked
  message. Show." Reactions from them are filtered before counting (find
  where reaction summaries are built for the row).
- Notices and pop-ups (`web/src/lib/notices.ts`, `notify.ts`): nothing from
  a blocked author. Test in `web/src/tests/notices.test.ts` style.
- DM list: a DM with a blocked person still shows but the composer is
  replaced with "You have blocked this person. Unblock." with a button.
- Where to block: the member's profile pop-over or the member row menu, and
  the DM header. "Block" / "Unblock". A settings section "Blocked people"
  under the user's own settings (`web/src/components/settings/`) listing
  them with Unblock.

## Files

- `server/src/db/schema.ts`, `server/drizzle/`, a routes file, `app.ts`,
  `routes/dms.ts`, `services/mentions.ts`, `services/read-state.ts`,
  `gateway/`, tests
- `web/src/lib/api.ts`, `web/src/state/store.tsx`, `state/dms.tsx`,
  `components/MessageList.tsx`, `MemberList.tsx`, `DirectMessages.tsx`,
  `components/settings/`, `lib/notices.ts`, `lib/notify.ts`, `styles.css`

## Not the job

Hiding the blocked person from member lists or voice (Discord does not
either). Telling them. Blocking in voice.
