# Lane brief: agent accounts, tokens, the channel flag and the permission ceiling (spec phase 1)

Read `docs/briefs/agent-channel/preamble.md` first. Ports for this lane: API 8811, web 5181, data dir `.data-accounts`.

## The job

Make an agent a real, walled-in account. A member creates one in Settings → My agents, enrols it in some of their servers, gets a token shown once, and sets its wake mode. A moderator flags a text channel "agents allowed". With the token, plain HTTP can read that channel and post to it, and the post appears in the app with the 🤖 badge. Everything else in the app refuses the agent, by route and by permission computation, and no human route can aim at an agent.

The stream, wake delivery, the connector and the guide page are later lanes. This lane leaves them a clean server surface and the shared message service they will call.

## Spec sections you implement

5.1 (all), 5.2 (all except the SSE part of revocation, which the stream lane wires into the hub registry you leave for it), 5.3 (all), 5.4 (the `agent_settings` row and the owner-only wake toggle only; qualification and delivery are the next lane), 5.5 for `GET /api/agent/me`, `PATCH /api/agent/me`, `PUT /api/agent/me/avatar`, `GET …/messages`, `POST …/read`, `POST …/messages` (with `Idempotency-Key`), and the one error shape for every agent route, 5.6 for the compact message JSON the `messages` route returns (the text rendering is the connector's), 5.12 for Settings → My agents, the member-list badge, and the channel header line, 6.1 and 6.2 for where things go.

Also: the agent rate limits in 5.4 for messages (20 a minute an agent).

## Where things are

- Schema `server/src/db/schema.ts` (users at 66, sessions at 97, channels at 301). Next migration is `0037`; generate with `npm run db:generate` and keep `server/drizzle/meta/_journal.json` intact.
- Sessions: `server/src/services/auth.ts` (`resolveSession` around 76–92 requires `expiresAt` in the future and drops disabled users). Agent sessions: `sessions.kind = 'agent'`, 365-day expiry slid forward on use (no more than once a minute, like the existing touch). Human sessions and human rows untouched by the migration.
- Request auth and the CSRF/Origin check: `server/src/app.ts`. Bearer only on `/api/agent/*`, only for `kind = 'agent'` sessions; the refusals and error codes are exactly 5.2's. The `/gateway` upgrade refuses bearers and agent users.
- Permissions: `server/src/services/permissions.ts`. The ceiling goes in every path that returns permissions for a user, including the owner and administrator early returns (around 179–180 and 223–225) and the server-level `basePermissions`/`requireServerPermission` path (around 297–306). `channelReaders()` excludes agents explicitly.
- Messages: `server/src/routes/messages.ts`. Extract `server/src/services/messages.ts` (send: validation, house rules, slowmode, claim, mention resolution, poll/roll parsing, insert, broadcast) and call it from both the human route and the agent route. One implementation; the routes differ only in auth and serialization. Keep the human route's behaviour byte-for-byte: its existing tests must pass unchanged.
- Read state: `server/src/services/read-state.ts`. `markRead` (95) clears mentions wholesale; the agent route needs the counting variant 5.5 describes.
- Mentions: `server/src/services/mentions.ts`, `parseMentions` in `shared/src/validation.ts`. Agents write `@username`; the server converts known usernames to `<@id>` before the normal resolver runs and returns the rest in `unresolved`. Text inside backtick code spans and between triple-backtick fences is never converted (the markdown lane is teaching the renderer and `parseMentions` the same rule; keep yours in one small function so the two can meet).
- Human-side target checks: `routes/dms.ts`, `routes/roles.ts`, ownership transfer in `routes/servers.ts`, friends/blocks in `routes/blocks.ts`. Refuse an agent as the target.
- Leaving, kicks, bans, account disable: find where `members` rows are deleted and users disabled (`routes/servers.ts`, `routes/invites.ts`, `services/servers.ts`, `routes/auth.ts`, `scripts/` for admin disable). Remove the owner's agents from that server, or disable them, in the same transaction.
- Login: `routes/auth.ts`. An agent can never sign in with a password, whatever its `passwordHash` holds. Choose between a nullable `passwordHash` and a sentinel no verifier accepts; test it either way.
- Hub: `server/src/gateway/hub.ts` `closeSession`/`closeSessions` (628–647) iterate WebSockets only. Leave a small registry API there that the stream lane will register SSE connections with, and make token regeneration, agent deletion and owner disable call it (with no SSE connections yet, it closes nothing; the stream lane adds the connections and the test).
- Settings UI: `web/src/components/settings/` (follow `AccountSettings.tsx` and the pane pattern). Member list: `web/src/components/MemberList.tsx`. Message author rendering: `web/src/components/MessageList.tsx` (author line only; the markdown lane owns the body renderer). Channel settings: `web/src/components/settings/ChannelSettings.tsx` for the toggle and its line.
- Route tests to extend: `server/src/tests/route-authorization.test.ts`, `permissions.test.ts`, `mentions.test.ts`, `unread-count.test.ts`. Wes added `routes/server-icon.ts` and `/api/host/server-requests` recently; the route matrix covers them too.

## Decisions already made

- Agent username is `<owner username>.<agent slug>`. If that username is taken (people's usernames may contain dots), creation is refused with a plain message naming the clash; no namespace reservation in this release.
- Wake default `mentions`. Only the owner changes it, only through the cookie side. The agent can read it in `me`.
- Text channels only for the flag. Flag and `encrypted` are mutually exclusive both ways, in one transaction.
- Display in the app: owner's name and the agent's name with the badge, e.g. **🤖 Trey's Scrier**. The header and the channel settings line read exactly **Agents can read and post here. Not encrypted.**
- An unflagged channel is a 404 to an agent, same as any hidden channel.

## Not in this lane

The SSE stream, wake qualification, batching, catch-up, the loop breaker, typing, reactions, votes and polls on the agent side, file upload and download routes for agents, cards, the connector, the guide page, and the nginx stream location.

## Tests (each new one red-proofed)

- The ceiling in all six evaluator paths: a channel overwrite, a role, ownership and administrator each fail to raise an agent above `VIEW_CHANNEL | READ_MESSAGE_HISTORY | SEND_MESSAGES | ADD_REACTIONS | ATTACH_FILES` on a flagged channel, and to anything above 0 elsewhere.
- Route matrix: every route × human cookie, agent bearer, agent cookie, human bearer. Agents reach only `/api/agent/*`; humans never reach it; the gateway refuses bearers.
- Target-kind checks: role to agent, DM to agent, ownership to agent, block/friend to agent all refused.
- Flag/encrypted exclusivity both ways; `channelReaders` excludes agents (key issuance and epoch retirement never see one).
- Enrollment lifecycle: owner leaves, is kicked, is banned, is disabled; agent deleted; enrollment only where the owner is a member.
- Session expiry rule: agent sessions slide, human rows untouched by the migration.
- Mention count recomputed on a partial read.
- `@username` conversion: known, unknown (in `unresolved`), inside code (untouched).
- Idempotency: a repeat with the same key replays the same response; a repeat with a different body is 409 `idempotency_mismatch`.
- Smoke checks over real HTTP in `server/src/scripts/smoke.ts` style for the phase-1 exit walk below.

## The walk you photograph (capture directory `docs/shots/agent-accounts/`)

On your own ports with a seeded database. As `mara` (a member, not the server owner): open Settings → My agents (empty state), create an agent and pick a server (token shown once), see it listed with its wake mode. As `wes` (the owner): open a channel's settings, flag it (see the line), try to make it encrypted (refused). Then with `curl` and mara's agent token: `GET /api/agent/me`, read the channel, post a message, and try an unflagged channel (404). Photograph the message in the app with its badge, the member list with the agent, and the channel at phone width. Then, as `wes`, kick `mara` and show the agent gone from the member list. Save the curl transcript beside the pictures as `curl-walk.txt`. If the seed's names differ, use the seed's member and owner and say which.
