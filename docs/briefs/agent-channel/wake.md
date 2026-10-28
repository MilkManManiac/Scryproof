# Lane brief: the agent stream and the wake engine (spec phase 2, server side)

Read `docs/briefs/agent-channel/preamble.md` first. Ports for this lane: API 8813, web 5183, data dir `.data-wake`. You start from the merged accounts lane: agent accounts, bearer auth, the ceiling, the flag, `agent_settings`, the shared message service, the agent error shape and the hub's SSE registry hook all exist.

## The job

Give each agent one live stream that tells it, at once, when something it should answer happens, and nothing else. The owner's wake mode (every message, mentions, never) is applied by the server on every path, live and on reconnect. Agents talking only to each other pause after six messages in a row until a person posts. Revoking a token or changing a mode reaches an open stream immediately. Plus the small agent routes the connector needs for reactions, votes, polls and the "is thinking…" line.

## Spec sections you implement

5.2 (revocation reaching the stream), 5.4 (all: one qualification function, live delivery with the 3-second window, catch-up honouring the mode, loop breaker, agent rate limits for reactions), 5.5 for `GET …/catchup`, `PUT /api/agent/messages/:id/votes`, `POST /api/agent/messages/:id/reactions`, `GET /api/agent/messages/:id/poll`, `POST …/typing`, `GET /api/agent/stream`, and the stream's nginx `location`, 5.6 for the wake event payload (`{from, to}` ids, triggering messages plus up to 12 qualifying since `lastRead`, the wake budget of 6,000 rendered characters; the server measures with the same rendering rule the connector uses, so put the renderer's size function in `shared/`).

Also the gateway side of 5.12 the web lane will draw: a per-agent "connector online" state and current wake mode for the member list, the paused state per channel, and the typing event, broadcast to humans through the existing gateway events.

## Where things are

- `server/src/services/agent-wake.ts` (new): qualification, batching, catch-up, loop breaker. One qualification function called by live delivery, flush re-checks and catch-up alike; spec 5.4 lists its rules, including that edits never re-qualify (`routes/messages.ts` around 688–690) and that the resolved `mentions` are what count (`services/mentions.ts` 64–79 already drop self-mentions and unauthorized `@everyone`).
- `channel_agent_runs` table (migration after the accounts lane's): the consecutive-agent-message counter updated in the same transaction as the insert (`UPDATE … RETURNING`), reset with the pause by a human message in the same transaction. Hook it in the shared send service, not in a route.
- Hub: `server/src/gateway/hub.ts`. Register SSE connections under their session id through the hook the accounts lane left, so `closeSession`/`closeSessions` reach them; regeneration, deletion, owner disable, server removal and wake-mode changes tear down or update the stream at once, and pending wakes for a revoked session are dropped.
- Stream route: `routes/agent/stream.ts` (or beside the accounts lane's agent routes). One connection per agent: a second closes the first. Events `wake`, `settings`, `ping` every 25 s. Headers for SSE through nginx (`X-Accel-Buffering: no`, no compression).
- nginx: `infra/custom/templates/site-nginx.conf.j2`. Add a `location /api/agent/stream` before `location /api/` (which only disables request buffering, around 82–95) with response buffering off and a read timeout above the ping interval. `scripts/prod-check.mjs` reads headers out of that template through a Node stand-in for nginx; extend it so a stream through the stand-in delivers a wake and a ping. That proves the app's side only. A real nginx is not on this Mac; the real-nginx check happens on the box at ship time and is in the ship step, not yours.
- Reactions, votes, polls: the human routes and `services/reactions.ts`, `services/polls.ts` (82–95 for the viewer-filtered tally). Agent routes call the same services; secret and anonymous polls stay that way for agents.
- Typing: the existing typing broadcast; the agent route shows "<Owner>'s <Agent> is thinking…" for 8 s.

## Decisions already made

- First qualifying message after quiet goes out at once; further ones in the next 3 s are collected into one following event; the window is fixed from the first collected message and never extended. At flush every message is re-checked (not deleted, agent still enrolled, mode unchanged, channel not paused); a wake with nothing left is not sent.
- `@everyone` wakes agents in `mentions` mode when the sender was allowed to use it (Trey, 2026-10-19). An @-mention of the owner does not wake the agent.
- Mode `off`: nothing live, and catch-up returns no messages, only counts. Explicit reads through `messages` work in every mode; a read is not a wake.
- Loop breaker at 6. Paused agents can still read and post; they are not woken by each other.
- The server never says an agent is "listening"; "connector online" means a stream is open.

## Tests (each new one red-proofed)

- Qualification: self, reply to the agent, `@everyone` authorized and not, deleted, edited, each mode × live and catch-up.
- Batching: first delivered at once; the window is not extended by a busy channel; re-check at flush drops a deleted message and a whole wake when nothing is left.
- Loop breaker atomicity under concurrent agent sends (the counter cannot skip 6), and reset by a human post.
- Stream: single-connection rule; revocation by regeneration, deletion, owner disable and server removal tears the stream down; a wake-mode change arrives as a `settings` event.
- Budget: a wake over 6,000 rendered characters is cut with `omitted`, never mid-message.
- The stream through `test:prod`'s stand-in: a wake and a ping arrive unbuffered.
- Agent reactions, votes and poll reads respect poll visibility and the reaction rate limit.

## The walk you check (capture directory `docs/shots/agent-wake/`)

On your own ports: open a stream with `curl -N` and an agent token; as a seeded human, post an ordinary message (no wake in `mentions` mode), then an @-mention (wake within a second; record the timestamps), then three mentions quickly (one immediate wake, one batched); switch the mode to `off` in the app (a `settings` event; further mentions silent; catch-up returns counts only); have two agents' tokens post six messages in a row (paused: record the gateway event humans receive, since the web lane draws the banner), then post as a human (resumed). Regenerate the token in the app and show the stream closing. Save the `curl -N` transcripts as `stream-walk.txt` with timestamps, and a screenshot of the token regeneration in the app.
