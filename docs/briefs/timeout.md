# Timeout a member

Read `docs/briefs/README.md` first.

## The job

A moderator can quiet someone for a while without kicking them: 1 minute,
5 minutes, 1 hour, 1 day, 1 week. While timed out the member can read but
cannot send messages, add reactions, edit, or join voice in that server.
It ends on its own, or a moderator ends it early.

## Server

- Schema, `server/src/db/schema.ts`: `members.timeoutUntil` (nullable
  timestamptz). Migration with `npm run db:generate`; commit the SQL and
  `meta/` changes.
- Permission: a new bit `MODERATE_MEMBERS` in `shared/src/permissions.ts`
  with a name and description in the same style as the others (look at
  how `KICK_MEMBERS` is listed and labelled, including
  `web/src/lib/permissionMeta.ts`). Owner and ADMINISTRATOR already cover
  everything. Do not renumber existing bits.
- Routes in `server/src/routes/servers.ts` next to kick and ban:
  `PUT /api/servers/:id/members/:userId/timeout` with `{ until }` (ISO,
  at most 28 days out) and `DELETE` to end it. `requireHigherThan` applies
  as it does for kick: you cannot time out someone at or above you, or the
  owner. Audit log entries like kick's.
- Enforcement, on the server, where the actions are checked today:
  sending, editing, reacting (`server/src/routes/messages.ts`,
  `services/reactions.ts`) and voice token issue (`server/src/routes/voice.ts`).
  A single helper `assertNotTimedOut(ctx)` in
  `server/src/services/permissions.ts` that the `MemberContext` makes
  cheap (load `timeoutUntil` with the member row). Error: 403 with
  "You are timed out in this server until <time>." Expired timeouts are
  simply ignored; no job clears them.
- `timeoutUntil` rides on the serialized member so clients can show it.
  Broadcast the member update the way nickname changes are broadcast.
- Test in `server/src/tests/permissions.test.ts` or a new file: a timed-out
  member is refused, an expired one is not, the helper is what decides.

## Client

- Member right-click / row menu (find where Kick lives in
  `web/src/components/MemberList.tsx` and the `Menu` component): "Time out"
  with the five durations as a submenu or a second menu, and "End timeout"
  when one is running. Only shown with `MODERATE_MEMBERS`.
- The composer for a timed-out person: disabled, with the note "You are
  timed out until <time>." Reaction and voice buttons hidden the same way.
- A small clock mark beside the name in the member list while it lasts,
  with the time in the title.

## Files

- `shared/src/permissions.ts`, `web/src/lib/permissionMeta.ts`
- `server/src/db/schema.ts`, `server/drizzle/`, `server/src/routes/servers.ts`,
  `messages.ts`, `voice.ts`, `services/permissions.ts`, `services/reactions.ts`,
  `services/serialize.ts`, tests
- `web/src/components/MemberList.tsx`, `Composer.tsx`, `web/src/lib/api.ts`,
  `web/src/styles.css`

## Not the job

Role-level or channel-level timeouts. DMs (a timeout is per server).
