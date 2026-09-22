# Events: next session, who is coming

Read `docs/briefs/README.md` first. Sonnet-sized, with one judgement
call (the reminder) spelled out below.

## The job

A server keeps a short list of upcoming events: "Session 12, Friday 7pm,
#voice-table". Anyone with Manage events (a new permission bit; see
`shared/src/permissions.ts` and the meta in
`web/src/lib/permissionMeta.ts`) can create one. Everyone sees the list
at the top of the channel sidebar under a heading "Coming up", and can
answer Going / Maybe / Can't. An hour before, everyone who said Going
or Maybe gets a notice in the inbox (and a pop-up if they allow them).

## Server

- Schema: `events` (`id`, `server_id`, `channel_id` nullable, `title`
  1 to 100, `note` 0 to 1000, `starts_at` timestamptz, `created_by`,
  `created_at`, `reminded_at` nullable) and `event_rsvps`
  (`event_id`, `user_id`, `answer` in `going | maybe | no`, primary key
  on the pair). One migration.
- Routes in a new `server/src/routes/events.ts`, registered where the
  others are (`server/src/app.ts`): list for a server (upcoming only,
  `starts_at` ascending, with counts and the caller's answer), create,
  update, delete, and `PUT .../rsvp`. Permission on create, update and
  delete is the new bit; listing and answering need only membership.
  Gateway events `event_create`, `event_update`, `event_delete`,
  `event_rsvp` added to `shared/src/gateway.ts` and fanned out to the
  server's members the way `channel_update` is.
- **The reminder.** A `setInterval` in the server, once a minute, finds
  events with `starts_at` within the next 60 minutes and `reminded_at`
  null, marks them, and fans out `event_reminder` to each member who
  answered Going or Maybe. There is exactly one server process
  (bonesdeploy, systemd), so an interval is enough; say so in a comment
  and do not build a job table.
- Tests: the reminder query with a fixed clock; permission on create.

## Client

- `web/src/state/store.tsx` holds `events[serverId]`, filled from
  `ready` (add them to `ServerDetail`, where roles and channels already
  are) and kept fresh by the gateway cases.
- `ChannelSidebar.tsx`: a "Coming up" block above the categories with
  the next three events: title, "Fri 7:00 PM" in the viewer's zone, the
  channel name if set, and the three answer buttons with counts. Click
  the title for the full note. A "+" beside the heading for whoever may
  create, opening a small `Modal` (the same one channels use) with
  title, date and time, optional channel, note.
- `web/src/lib/notices.ts`: `Notice.kind` gains `'event'`; the reminder
  lands there with the title and when it starts, and the pop-up path in
  `notify.ts` treats it like a mention.
- Dates: `<input type="datetime-local">`, stored as an ISO string in UTC.
  Formatting with `Intl.DateTimeFormat`, the way `MessageList.tsx` does.

## Not in this job

Recurring events, a calendar view, editing who was reminded.
