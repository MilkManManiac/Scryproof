# Grok 4.7 review of the agent stream and wake engine

Read-only review by Grok 4.7 (xhigh) through delegate, 2026-10-27, against agent-channel at c3adc8d (before the wake tests merged; the prod-check finding below was already fixed by ea30268). Verbatim report follows.

## Completion report

- Status: completed
- What I found: four defects and one verification gap. No blocker. Live qualification, the 3-second batch window, the loop breaker under concurrent sends, budgets, stream replacement, token revocation, polls, and reactions behave as specified.
- Files changed: none. Reviewed the wake service, stream route, hub, message send, tracker lines, migration 0038, the nginx template, and the prod-check stand-in.
- Verification: API on port 8820 with a local database, seeded, then two curl/WebSocket probes. Server stopped. No source diff.
- Remaining: the one-connection gap below was not hit on this server. Owner disable was not run as its own request; it uses the same close path as delete. A real nginx is not on this machine. The single-message preview that only appears once file metadata pushes a wake over 6,000 characters was not re-run.

No code to merge from this worktree. Fix the findings on the agent-channel branch, then retire this worktree with `delegate worktree remove`. The probe database was removed. Other untracked paths already in the worktree were left alone.

## Findings

### High — a settings refresh throws away pending wakes

`server/src/routes/agent/stream.ts:51-53`, `server/src/services/agent-wake.ts:115-119`, `server/src/gateway/hub.ts:414-419`. Proved by running.

`refresh()` calls `delivery.reset()`, which bumps a generation counter and deletes every channel's pending batch and timer. Two callers do that for reasons that do not disqualify the pending message:

- Renaming a role calls `invalidateServerPermissions` (`server/src/routes/roles.ts:209`). The hub then refreshes every connected agent in the process, not only agents in that server.
- Pausing one channel calls `announceAgentPause` (`server/src/services/agent-wake.ts:261-266`), which refreshes every agent in the server and clears their other channels too.

Sequence 1: mentions mode, quiet channel. An @-mention arrives in 23 ms. A second @-mention is posted (200). The Table Mods role is patched to the same name (200). Four seconds later that second message is in no wake.

Sequence 2: another flagged channel already has five agent messages. On the first channel, an @-mention arrives immediately and a second is posted (200). The sixth agent message on the other channel returns 200 and the human gateway gets `channel_agents_paused` with `paused: true` for that other channel only. Four seconds later the mention on the first channel has not arrived.

The second mention should flush on the original 3-second window. A role rename does not change mode or enrolment. Pausing channel B should drop pending wakes for channel B only.

Smallest fix: stop calling `delivery.reset()` from `refresh()`. The flush already refuses a send if that channel is paused, the agent lost access, or the wake mode changed between the read and the send (`agent-wake.ts:225`). Drop pending explicitly only on revocation and on a wake-mode change. The spec's flush rule is that the mode is unchanged, so a mode change may still discard. A role edit or a pause on another channel must not.

### High — catch-up while paused says nothing qualified

`server/src/services/agent-wake.ts:39` and `server/src/services/agent-wake.ts:100-102`. Proved by running.

`qualifiesForWake` returns false when the channel is paused, and `catchup` then returns an empty body with `qualifying: 0`. Pause is a live-delivery rule in spec 5.4. Catch-up is specified to follow the wake mode. Paused agents can still read.

Sequence: @-mention the agent in a flagged channel, then six agent messages so the channel pauses. `GET /api/agent/me` shows `paused: true`. `GET /api/agent/channels/:id/catchup` returns `unread: 7`, `qualifying: 0`, `messages: []`. `GET /api/agent/channels/:id/messages` still contains the mention (200).

The mention qualifies under mentions mode. Catch-up should return it. A connector that connects during the pause is told nothing qualified, and lifting the pause does not replay the message. The explicit read already works.

Smallest fix: remove pause from `qualifiesForWake`. Keep the pause check on the live path (`wakeForMessage` and the send check in `emitWake`). In `catchup()`, do not blank the result because the channel is paused.

### Medium — an initiative line is a human message that skips the send path

`server/src/routes/trackers.ts:158-171`, called at line 220 and again for the round-ended line near line 354. Proved by running.

`postLine` inserts a message and broadcasts it. It does not update `channel_agent_runs`, and it does not call `wakeForMessage`. The loop breaker is specified to reset on a human-authored message, in the same transaction as the insert, inside the shared send service.

Sequence 1: channel confirmed paused. `POST /api/channels/:id/tracker` returns 200 and the history contains "Initiative started." `GET /api/agent/me` still shows that channel paused.

Sequence 2: a different flagged channel, agent in mode `all`, not paused. The same tracker post returns 200. No wake in the next 800 ms. An ordinary mention on a quiet channel arrives in about 20 ms.

The pause should clear, and in mode `all` the line should wake. The smallest fix is to send those lines through `sendChannelMessage`.

### Low — deleting an agent never broadcasts offline

`server/src/services/agents.ts:297-311` and `server/src/services/agents.ts:373-377`. Proved by running.

Disable deletes the memberships, then closes the stream. `agentChanged` broadcasts `agent_status` only to servers where the agent is still a member, so the broadcast list is empty. `announceAgentsRemoved` (`agents.ts:410-416`) sends `member_leave` only. Owner disable uses this same close (`server/src/routes/host.ts:92`); that request was not run separately.

Sequence: open the stream, wait until settings have arrived, delete the agent. The stream closes. The human gateway then receives `member_leave` and no `agent_status` with `online: false`. The connect had already broadcast `online: true`.

The member list drops the person on `member_leave`. The client's agent map keeps the last online true. Broadcast `online: false` to the servers captured before the memberships were deleted.

A normal disconnect does broadcast offline. Fifteen rapid connect/abort cycles left the agent offline on both the gateway and `GET /api/agents`.

### Low — the prod-check stand-in never delivers a wake or a ping

`scripts/prod-check.mjs:153-162`. Found by reading.

The stand-in will flush and pipe `/api/agent/stream` when the template says buffering is off. Nothing in that script requests the path. The only other hit is the template parser at lines 79-91. The brief asked this stand-in to deliver a wake and a ping. It cannot, because it is never asked.

Smallest fix: from the stand-in, open the stream, post a mention, and require that a wake and a ping arrive before the response ends.

## Where nothing material showed up

Qualification goes through `qualifiesForWake` for the live check, the flush, and catch-up. Ran: an ordinary message does not wake mentions mode; an @-mention of the owner does not; an @-mention of the agent arrives in 16–23 ms; a reply with no @ arrives in 22 ms; the agent's own post does not wake it; @everyone from a member who cannot use it does not wake; @everyone from the owner does. A pending message deleted before the flush produces no wake, and the next mention is immediate (22 ms), so an empty flush does not hold the window. An edit that adds a mention does not wake. An edit that removes one still qualifies on catch-up, because `wakeMentions` is written on the insert (`server/src/services/messages.ts:476`) and the edit does not change it (`server/src/routes/messages.ts:302-321`). Migration 0038 backfills only rows with `edited_at` null; edited history stays null and fails closed.

Batching: after quiet, the first mention is immediate. Two more, the second 2.5 s after the first, leave as one wake 3018 ms after the first collected message, with both triggers. A batch on another channel does not delay a quiet channel (19 ms), and that other batch still flushes at 3018 ms.

Switching the mode to `all` sends `settings` and drops the pending batch. That matches the spec's "mode unchanged" flush rule, so it is not filed.

Loop breaker: five agent messages do not pause; the sixth pauses once; the seventh still posts and does not pause again; a human post resumes once. Five parallel sends do not pause. Six parallel sends all return 200 and pause exactly once. Eight races of a human post against the sixth agent message all ended unpaused. A mode-`all` agent is woken by agent posts before the pause and not by the pausing post or the one after it. `agentsPaused: true` is on channel GET, server detail, a topic update, and the human gateway ready frame.

Stream: `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`, `text/event-stream`. Settings on connect. A ping arrives. A second connection closes the first. Five rounds of eight simultaneous connections left one stream open and one hearer. Regenerating the token closes the stream, the pending wake does not arrive, and the old token is 401 `invalid_token`. Clearing `serverIds` closes the stream. The nginx template puts `location = /api/agent/stream` before `location /api/`, with buffering off, gzip off, and a 75 s read timeout. The app sets the accel header and does not compress the response.

Budgets: a burst of long triggers split into two wakes, rendered 5126 and 5063 characters, no trigger missing, `from`/`to` in order. Catch-up of 20 qualifying messages rendered 11340, omitted 8, and kept the newest. A 7000-character body rendered at 1442 because the shared renderer cuts the body at 1200, so the file-metadata preview path was not reached.

Routes: an unflagged channel is 404 `not_found` for messages, reactions, poll, votes, and typing. A secret poll returns counts `[0, 0]`, no voters, and the agent's own vote. A shown poll includes voters. A bad vote and a non-poll are `bad_request` and not retryable. The 61st reaction is 429 `rate_limited` and retryable. Typing broadcasts `typing_start`. Missing token, a human cookie, and a human session presented as a bearer all use the agent error shape.

The one-connection handler closes older streams, then awaits a session lookup, then registers (`server/src/routes/agent/stream.ts:27-71`). Two connects inside that gap could both remain. One replacement plus five rounds of eight did not leave two open on this server. A per-agent lock is the small fix if that is tightened for Postgres, where those queries can overlap.
