# Grok 4.7 review of agent accounts and the wall

Read-only review by Grok 4.7 (xhigh) through delegate, 2026-10-27, against agent-channel at 6ab5805, replacing a Sol review cut off by its provider (Sol's five leads are verified below). Verbatim report follows.

## Completion report

- Status: completed
- What I did: Read-only review of the agent-accounts boundary on the current `agent-channel` tree. Reproduced the earlier leads against this source with an in-process server on `127.0.0.1:8821` and a throwaway PGlite directory. Mail inbox had no task message.
- Files changed: none in the repository. `npm ci` filled gitignored `node_modules`. The probe, symlink, and database live under `/private/tmp/grok-accounts-scratch/`.
- Verification: `node --import tsx /private/tmp/grok-accounts-scratch/probe.mjs` exited 0 and closed the server. Existing `agent-*.test.ts` files were not run. The 21st send in a minute was not re-looped.
- Remaining risks: the enrollment race was shown by pausing before the membership transaction, then committing the removal, then resuming. It does not depend on two SQL transactions overlapping. Nickname, timeout, login refusal, token-hash format, session slide, and migration 0037 were read, not re-executed this session.

## Review

One high defect and four medium defects are still in this tree. The earlier budget lead is false on this code. The route wall, the permission ceiling, and `@everyone` hold.

### High

**Enrollment can finish after the owner is already gone or disabled.** Proved by running.

`checkServersFor` (`server/src/services/agents.ts:86-106`) reads the owner’s memberships, then returns. `createAgent` inserts the agent and its memberships later (`agents.ts:187-207`). `updateAgent` does the same split for servers being joined (`agents.ts:234-254`). `removeMember` (`server/src/services/servers.ts:262-277`) only deletes agents that already have a membership row. Account removal snapshots live agents before its transaction (`server/src/routes/host.ts:82-88`), so an agent created after that snapshot is never disabled. The bearer check looks at the agent’s own `disabledAt`, and channel permission looks at the agent’s own membership.

Sequence, with the next `db.transaction` paused after the preflight:

1. Start `createAgent` for an owner who is a member. After the preflight, kick that owner with `removeMember`. Resume. The owner is not a member. The agent is. `GET /api/agent/me` returns 200 and lists `general`.
2. Same pause around `updateAgent` re-enrollment, then `removeMember`. Same result: owner gone, agent still a member.
3. Same pause around `createAgent`, then `POST /api/host/remove-account` for the owner (200). Resume. The owner is disabled and not a member. The agent is still a member. `GET /api/agent/me` returns 200 with `general`. `POST /api/agent/channels/:flagged/messages` returns 200.

Spec 5.1: an agent leaves in the same transaction as its owner, and a disabled owner’s agents are disabled with them.

Smallest fix: inside the create and update transaction, lock the owner row and require `disabledAt` null and a current membership in the same statement as the membership insert. `removeMember` and account removal must take that same lock first, and `liveAgentIdsOf` must run inside the disable transaction after the lock. A second read under read committed, still outside that lock, does not close it.

### Medium

**Two overlapping token regenerations both stay valid.** Proved by running.

`regenerateAgentToken` (`server/src/services/agents.ts:274-278`) revokes, then inserts, as two awaits. `Promise.all` of two calls left one revoked agent session and two unrevoked ones. The previous token is dead. Two new tokens each last 365 days. The route limit of 10 per minute does not serialize two calls already in flight.

Smallest fix: one transaction that locks the agent user row, revokes unrevoked agent sessions, and inserts the new session.

**The same idempotency key and body replay onto another channel, including one agents cannot use.** Proved by running.

`once` (`server/src/routes/agent/channels.ts:93-119`) keys only on agent id and `Idempotency-Key` (`:102`). The body hash does not include the channel. `POST` wraps the send in `once` (`:211`), so a cache hit never reaches the channel check.

Sequence:

1. `POST /api/agent/channels/:flagged/messages` with `Idempotency-Key: probe-key` and `{"text":"probe"}` → 200, id `01a17cf6-bfc2-70b6-bea3-5b7bc049824f`.
2. Same key, body `{"text":"other"}` → 409 `idempotency_mismatch`.
3. Same key and `{"text":"probe"}` to the unflagged channel → 200 and that same id. The unflagged channel has 0 stored rows.
4. The unflagged channel without the key → 404, “That channel does not exist, or agents are not allowed in it.”

An unflagged channel must be indistinguishable from a missing one. A different channel is a different request.

Smallest fix: put method, route, and channel id in the identity compared with the body hash. A mismatch is 409. Do not return the first channel’s success for a second channel.

**Poll option text on the agent wire contains user ids.** Proved by running.

Mentions in a poll are rewritten to `<@uuid>` before the options are stored. `compactMessages` copies those option strings into the summary (`server/src/services/agent-messages.ts:101-107`).

`POST /api/agent/channels/:flagged/messages` with text `/poll Choose | @probe-host | @probe-owner` returned 200. The compact poll text was `Poll: Choose <@01a17cf6-bf72-702d-a1ce-69175419eb35> 0 · <@01a17cf6-bf7c-705a-be26-fc3bb34a1f09> 0 · open`. Spec 5.6: mentions render as `@username`, and ids never appear in message text. A secret open poll would still show the ids, because the count is what gets hidden, not the option string.

Smallest fix: run the username rewrite on each option, and collect mention tokens from options as well as from the message body, before building that sentence.

**A moderator kick of an agent does not keep it out.** Proved by running.

`DELETE /api/servers/:serverId/members/:userId` (`server/src/routes/servers.ts:311-326`) writes a kick row, then `removeMember`. Re-enrollment only checks bans (`agents.ts:99-104`).

Sequence: host `DELETE` of the agent → 200. `GET /api/agent/me` then lists no channels. Owner `PATCH /api/agents/:id` with `{serverIds:[that server]}` → 200, and `general` is back. `PUT /api/servers/:id/bans/:agentId` → 200, and the same `PATCH` → 400 `agent_banned`. A moderator who can kick but not ban cannot keep the agent out. Ban already sticks.

Smallest fix: in `checkServersFor`, and in the in-transaction re-check from the high finding, refuse a server where that agent has a kick row, the same way bans are refused. There is no invite timestamp on this path for the human “kicked until a newer invite” rule to use.

### Low

**An unclosed fence stops `@username` conversion for the rest of the message.** Found by reading.

`proseSegments` (`server/src/services/mentions.ts:175-188`) treats an opening fence of three or more backticks as code until a closer of at least that length. If the closer never comes, the tail stays code and is not converted. The shared fence splitter only treats a finished fence as code, so an unfinished fence stays ordinary text there. A message that begins with an unclosed fence never pings. Closed fences and inline spans agree. This is not a permission bypass.

Smallest fix: use the closed-fence rule already used by the shared splitter, so an opener without a closer stays prose.

### The five earlier leads

1. Enrollment race. Confirmed, high. All three sequences above still succeed on this tree: create versus owner removal, re-enrollment versus owner removal, and create versus account removal. After account removal the agent can still post.
2. Token regeneration race. Confirmed. Two overlapping calls leave two live tokens. The old token does not survive. Medium, not high: the leak is an extra new token, and both belong to the same owner.
3. Cross-channel cached send. Confirmed, medium. Same key and body against the unflagged channel returns the first send’s id. Nothing is stored there. A post without the key is a 404.
4. Budget violation. Refuted by running. After a short message and an 8000-character message, `GET /api/agent/channels/:id/messages?limit=50&budget=200` returned count 0, no lengths, and `omitted: 2`. `readWindow` (`server/src/services/agent-messages.ts:158`) drops a message whose rendered size exceeds the budget before keeping it. The old “budget 200 returned an 8000-character body” result is not this code.
5. Poll UUID leak. Confirmed, medium, in the compact poll sentence above.

### Where nothing material turned up

Proved by running, unless noted.

The route wall holds. An agent bearer on `/api/health`, `/api/servers`, `/api/host/server-requests`, a server icon, `/api/auth/me`, `/download/installer.json`, and `/` is 401 `bearer_not_allowed` in the human error shape. `/api/agent`, `/api/agent/`, and `/api/agent/me/` are 404 in the agent shape. Encoded `/api/%61gent/me`, `/api/agent%2fme`, and `//api/agent/me` are 401 `bearer_not_allowed`. A raw `GET /api/agent/../auth/me` is an agent 404, not `/api/auth/me`. `inject()` of that URL is 401 because the client normalizes `..` before the server sees it. `HEAD` and `OPTIONS` do not cross the wall. A human cookie on `/api/agent/me` is 401 `token_required`. A human session token as a bearer there is 401 `bearer_not_allowed`. An agent token used as a cookie does not open `/api/servers` (401 unauthorized) and does not satisfy `/api/agent/me`. A WebSocket to `/gateway` with the agent bearer closes with 401 and never opens. Skipping the Origin check on agent paths does not accept a cookie: `POST` to an agent channel with the owner cookie, an evil `Origin`, and no bearer is 401 `token_required`. No CORS allow-origin header was observed.

The ceiling holds on the evaluators that were exercised. With the `@everyone` role set to every permission bit, a category overwrite allowing every bit, and `agentsAllowed` forced true on a voice channel: base permissions `0`, flagged text `179`, voice `0`, hidden `0`, and the bulk map matches. After the agent is written as `servers.ownerId`, base stays `0` and flagged text stays `179`. `POST` of `@everyone hello` stored `mentionsEveryone: false` and left the words as text. By reading: `channelReaders` skips non-humans, the flag-versus-encrypted update is one statement with a guard, and the channel route will not flag a voice channel.

By reading, these aims are refused in the route that would perform them: roles, direct messages, group direct messages, ownership transfer, and blocks. There is no friends list. Invites add the signed-in user, and an agent cannot log in. Nicknames are allowed by spec 5.1. Timeouts use the same membership check as for a person. Those last two were not re-run live this session.

By reading, and consistent with the functions the regen probe called: the token is `scry_` plus 32 random bytes, only the SHA-256 hex is stored, the expiry slides at most once a minute, migration `0037` only adds columns and tables, and login rejects `kind !== 'human'` before it checks a password. Single-threaded regeneration revokes the old session. Delete disables the agent when it already exists. A normal kick, ban, leave, or disable of an owner removes agents that are already members. The race above is the hole in that rule.

The agent error helper is the one shape on agent paths. A missing channel and an unflagged channel share the 404 on send. The send limit is 20 a minute at `server/src/routes/agent/channels.ts:220`. The idempotency map is swept on the next keyed send and is fed only by successful sends under that limit. By reading, the counting read-state recounts mentions after `upTo` instead of clearing them. The settings screen keeps the new token in component state only (`web/src/components/settings/MyAgents.tsx`); the owner client does not write it to storage or log it, and channel permissions are computed on the server. Reaction, vote, and poll-detail responses use the human message shape. Spec 5.5 says those routes follow the human routes. The compact poll sentence is the defect, not those responses.

### Tests that assert less than the spec

These are not missing-test findings. The files were read and not executed.

- `server/src/tests/agent-behavior.test.ts` replays an idempotency key on one channel. The cross-channel 200 would still pass.
- `server/src/tests/agent-lifecycle.test.ts` removes the owner only after enrollment has finished, and it expects `not_your_server` on a later rejoin. It would stay green through the race, and it never kicks the agent and then re-enrolls it.
- `server/src/tests/agent-ceiling.test.ts` covers an overwrite, a role, administrator, and owner on text channels. It does not cover a category overwrite, `@everyone` set to every bit, or a voice channel. The live probe of those three was inside the ceiling.
- `server/src/tests/agent-route-inventory.test.ts` calls registered templates through `inject()`. That client normalizes `..`, which this session showed: inject of `/api/agent/../auth/me` was 401, and the raw socket was an agent 404. The test would stay green if a raw dot-segment were delivered to a human handler. This tree did not do that.
