# The invite link opens something

Read `docs/briefs/README.md` first. Sonnet-sized, small, and the one
most new people will hit first.

## The job

`https://scryproof.com/invite/CODE` is what people paste to each other
(`server/src/routes/invites.ts` builds it), and today the web app ignores
the path: whoever opens it lands on the normal screen and has to find
the join dialog and type the code again. Make the link work.

## Server

- `GET /api/invites/:code` already exists. Confirm it answers without a
  session for a valid code (server name, icon, member count, whether it
  has expired) and that it does not leak more than that. If it requires
  a session today, split it: a public preview and the existing full
  answer. Say which in the report.
- nginx serves the app for any path already (the PWA does); check
  `infra/` for the `try_files` line and do not change it.

## Client

- Where the app boots (`web/src/main.tsx`, or the top of `App.tsx`):
  read `location.pathname`; an `/invite/CODE` match keeps the code in
  memory and replaces the URL with `/` (`history.replaceState`) so a
  reload does not re-run it.
- Signed out: the sign-in screen shows a line above the form, "You were
  invited to **Server name**. Sign in or make an account to join." The
  code survives sign-in.
- Signed in (or after sign-in): a `Modal` with the server's icon, name,
  member count and one Join button. Join calls the existing accept route
  and selects the server; the modal closes. An expired or unknown code
  says so in the same modal with only a Close button.
- Already a member: skip the modal and select the server.
- Tests: the path parser as a pure function in
  `web/src/lib/invite-link.ts`, tested in
  `web/src/tests/invite-link.test.ts`.

## Not in this job

The desktop app's protocol handler (a `scryproof://` link) and phones
that open the link in an in-app browser. Both are later.
