# Build plan: the agent channel, first release (spec phases 1–3)

Prepared 2026-10-26 for Trey's go. The spec is `docs/agent-channel-spec.md` (draft 3, amended 2026-10-26); this plan turns its section 7, phases 1–3, into a work graph with prepared briefs, per `~/.claude-shared/reference/build-plan-template.md`. The graph lives in beads under the epic "Agent channel: members connect their AI agents to one Scryproof channel"; the bead ids are in section 8.

**Scope ruling, Trey 2026-10-26:** "we stop at the end of phase 3 bc that's the core and we test it/dogfood it locally, then we ship it and test it w/ matt and wes etc." So: build phases 1–3, Trey dogfoods locally, then a separate ship step (GitHub pull request for Wes and a release from his PC, both gated) puts it on the box for the group. Phases 4–7 are not in this build.

## 1. Vision

The same block heads every lane brief: `docs/briefs/agent-channel/preamble.md`, section "Vision", and the epic's description. In short:

- **What we are building:** one flagged channel where members' own AI agents (vanilla Claude Code first, Loom too) join as walled-in members, woken by the server according to a mode only their owner sets.
- **Why:** what our agents find and draft never reaches each other or the group except by copy-paste; this closes the loop inside the app we already own.
- **For whom:** Wes, Matt, Trey and the group; Trey dogfoods first.
- **What must be true when it is done:** Trey's first look at accounts in his words; two of his agents and Trey converse in the channel on his local build, mentions wake within a second, "never" silences live and on reconnect, the loop breaker pauses after six; agents see nothing outside flagged channels and no human route can aim at them; agents' markdown renders on PC and phone with no HTML path; a member connects from the guide alone.
- **What exists that this replaces or extends:** extends the running app's accounts, sessions, permissions, messages, mentions, read states, gateway hub, Settings and Guide. Nothing replaced.
- **Stack:** the repo's (Node 22, TypeScript, Fastify, `ws`, Drizzle/Postgres with PGlite in development, React 19 + Vite, `node --test`); the connector a TypeScript workspace package for one copy of shared rules (spec 6.5). Closest house precedent for a TypeScript CLI: webqa.

## 2. Inputs

| Input path and revision | What it establishes | Kept the same or redesigned | Owner of approval |
|---|---|---|---|
| `docs/agent-channel-spec.md` at the commit that adds this plan | Behaviour, wire format, budgets, tests per phase | New feature; the spec is the reference | Trey (approved draft 3 on 2026-10-19; amended 2026-10-26) |
| `GAMEPLAN.md`, `CLAUDE.md` non-negotiables | Server-computed permissions, no third party, "encrypted" only where true | Kept; one accepted exception (spec 5.11) | Trey, Wes |
| The running app on branch `agent-channel` (GitHub main of 2026-10-25 plus the Mac sound work) | Every surface the agent work extends: `server/src/services/permissions.ts`, `services/auth.ts`, `routes/messages.ts`, `gateway/hub.ts`, `web/src/components/settings/`, `MemberList.tsx`, `MessageList.tsx`, `lib/guide.ts` | Extended, not redesigned; the human message route keeps its behaviour exactly | Wes (his app) |
| `docs/spikes/claude-channel-probe/` (2026-10-26) | The Claude Code channel push works on 2.1.310 when interactive with the dialog accepted | Basis for the connector's Claude Code face | Trey |
| `docs/briefs/agent-channel/guide-outline.md` | The guide page's sections | New page; waits on Trey's go | Trey |
| `thoughts/research/post-lessons-2026-10-19.md` | Lessons from Post the design carries | Background | — |

## 3. Reference and check

Deliverables (also on the epic as structured rows):

| Deliverable | Reference | Product boundary and check | Evidence at the accepted revision |
|---|---|---|---|
| Agent accounts, tokens, flag and ceiling (server) | Spec 5.1–5.6 phase-1 parts | Local API driven over HTTP with real tokens and cookies: the route matrix, the ceiling tests, and the curl walk in the accounts brief | Test output, `docs/shots/agent-accounts/curl-walk.txt` |
| Settings → My agents, channel flag, badge (web) | Spec 5.12; the existing Settings panes and member list | The running app in Chrome, photographed with `scripts/shot.mjs` at laptop and phone sizes, judged by the acceptance reviewer | `docs/shots/agent-accounts/` |
| Markdown rendering | Spec 5.7; the existing inline renderer | The running app, one markdown-heavy message, laptop and phone, two themes; the HTML-sink test | `docs/shots/agent-markdown/`, test output |
| Stream and wake engine | Spec 5.2, 5.4–5.6 | Local API with `curl -N` streams: timed mentions, batching, mode changes, loop breaker, revocation | `docs/shots/agent-wake/stream-walk.txt` |
| Connector and CLI | Spec 5.6, 6.5 (first-release command set) | The built `scry` against a local API; a real interactive Claude Code session through the channel; a real Loom session through `scry wait` | `docs/shots/agent-connector/` with `recording.cast`, `loom-recipe.md`, doctor output |
| Agent presence in the app, and the guide | Spec 5.12; approved guide outline | The running app with two connected agents; every guide section photographed; a stranger read | `docs/shots/agent-ui/`, `stranger-read.md` |

Who may waive: Trey for every must-be-true outcome; the coordinator for cosmetic differences in screenshots only, recorded with the reason.

## 4. Graph and prepared briefs

Five slices. Dependencies are data dependencies.

| Slice | Spec | Depends on | Builder | Brief |
|---|---|---|---|---|
| Agent accounts and the wall | phase 1 | nothing | opus, high | `docs/briefs/agent-channel/accounts.md` |
| Markdown rendering | phase 3 | nothing (runs alongside accounts) | sonnet, high | `docs/briefs/agent-channel/markdown.md` |
| Stream and wake engine | phase 2, server | accounts | opus, high | `docs/briefs/agent-channel/wake.md` |
| Connector, CLI, Claude Code channel | phase 2, connector | wake | sonnet, high | `docs/briefs/agent-channel/connector.md` |
| Agent presence and the guide | phase 2, web | wake; its acceptance also waits on the connector; its build waits on Trey's go on the guide outline | sonnet, high | `docs/briefs/agent-channel/agent-ui.md` |

Every brief starts with `docs/briefs/agent-channel/preamble.md` (pass it as the lane's preamble). Each slice expands into build → cleanup → acceptance; the build has one generated performance stage after every slice's acceptance. Product acceptance is judged by the other model family (sol) at the integrated revision.

Overlapping writes, serialized by the dependencies or kept small by the briefs: accounts and markdown both touch `web/src/components/MessageList.tsx` (author line versus one call site) and `shared/src/validation.ts` (mention conversion versus block parsing); merge one, then the other, and keep both. Accounts and wake both add migrations; wake's comes second by dependency.

Cleanup checks per slice (the generated defaults are Rust's and do not apply here): `npm run typecheck`, the slice's targeted tests rerun, and a read of the slice diff for stale text, dead code and leftover debugging.

Performance stage, what to measure: mention-to-wake latency on the local build (50 mentions, median and 95th percentile, from post to the wake line arriving at a `curl -N` stream and at `scry wait`), and the time to render a channel of 200 markdown-heavy messages in Chrome. Baseline at the built revision; there is no earlier version to compare with, so the baseline is the result, recorded for the box run after shipping.

## 5. Capacity and placement

This Mac, at most three lanes at once. The lanes are TypeScript with no compile step and their tests are `node --test` plus Chrome screenshots; nothing here is the heavy fan-out the workhorse rule is for. The Claude Code channel walk needs an interactive Claude Code signed in to Trey's account, and Trey's dogfood is on this Mac. Each lane runs its own API and web server on its own ports (in its brief); the gate's smoke API uses 8790 and `test:prod` 8797–8798. Tests run through `testrun scryproof <kind>`.

## 6. Trey's first look

A separate step after the accounts slice is built and before its acceptance: on the local build, Trey creates an agent in Settings → My agents, flags a channel, posts once with the token (the coordinator hands him the one `curl` line), and looks at the badge, the member list and the settings panel. His words are the result.

## 7. Finishing, and what comes after this build

- The coordinator merges passing lanes promptly so later lanes build on them, then runs `bash scripts/gate.sh` (declared to Loom as the `gate` check) once on the integrated candidate. Baseline before any build: see section 8.
- **Trey's dogfood** (a step blocked on all five slices): his vanilla Claude Code and a Loom agent (or a second Claude Code) talk with him in the channel on his local build for real. His words are the result. Findings become fixes in the same release.
- **Ship** (a step blocked on the dogfood, and gated): a GitHub pull request for Wes (needs Trey's explicit word for the push), Wes merges and releases from his PC with `scripts/release.sh`, then on the box: the stream through the real nginx (`scry doctor` sees a ping within 30 s), the Claude Code walk once against scryproof.com, and Wes, Matt and the rest connect from the guide. The real-nginx check cannot run before the box: this Mac has no nginx and `test:prod` uses a stand-in.
- Phases 4–7 (files and voice notes, cards, artifacts, the plain-MCP face with Codex, installers) wait for what the group's test teaches; one deferred step holds them.

## 8. Ledger and state

Created 2026-10-26 with `bd-tails` and `bd create --graph`, under the existing epic `Scryproof-bbf` (its description now carries the Vision block and its metadata the deliverables).

| Step | Slice container | build | cleanup | acceptance |
|---|---|---|---|---|
| Agent accounts and the wall | `Scryproof-jez` | `Scryproof-pen` | `Scryproof-czo` | `Scryproof-jfx` |
| Markdown rendering | `Scryproof-thm` | `Scryproof-w4m` | `Scryproof-ru3` | `Scryproof-4i7` |
| Stream and wake engine | `Scryproof-31i` | `Scryproof-po1` | `Scryproof-8as` | `Scryproof-a98` |
| Connector, CLI, Claude Code channel | `Scryproof-851` | `Scryproof-0we` | `Scryproof-5si` | `Scryproof-p0q` |
| Agent presence and the guide | `Scryproof-x9b` | `Scryproof-e7j` | `Scryproof-jpm` | `Scryproof-cc2` |

Other steps: Trey's first look `Scryproof-i1k` (after accounts build, before its acceptance); Trey's go on the guide outline `Scryproof-ps4` (blocks the agent-presence build); performance `Scryproof-rg1` (after every acceptance); Trey's dogfood `Scryproof-xzi` (after every slice); ship `Scryproof-ja2` (after the dogfood, gated); phases 4–7 deferred as `Scryproof-bbf.2`.

Launchable at creation: the accounts build, the markdown build, and the guide-outline go.

**Gate baseline, 2026-10-26, branch `agent-channel` before any build** (`bash scripts/gate.sh` through `testrun`, on Trey's Mac): typecheck clean; server 406/406; web 591/591; desktop 152 pass, 1 skipped; production build; `test:prod` 13/13; smoke 104/104 against a fresh API. Two instrument fixes were needed first and are in the same commit as this plan: `test:prod`'s policy check matched `'wasm-unsafe-eval'` (in the template since 2026-09-25) as if it were `'unsafe-eval'`, now exact keywords, red-proofed against a policy with real `'unsafe-eval'` and `'unsafe-inline'`; and `/Applications/Google Chrome.app` on this Mac is a script pointing at a deleted Playwright build, so `scripts/find-chrome.sh` picks a Chromium that starts.

## 9. Relaunch, 2026-10-27: Trey's changes

**No tests from builders (Trey, 2026-10-27):** "NO subagents write any tests just straight product code. then, at the end of a wave/batch, a few lanes should use the test audit skill to instead guide writing only the few high quality useful tests we actually need." Build lanes write product code only and still do their walks (curl transcripts, screenshots, recordings are product evidence). At the end of each wave, test lanes briefed by `docs/briefs/agent-channel/tests.md` run the `test-value-audit` skill's authoring gate over the slice briefs' test lists and write only what clears it, red-proofed. This replaces the per-lane test lists in sections 3 and 4 as builder work; the lists become the test lanes' candidates.

**Models (Trey, 2026-10-27):** terra used heavily, alongside opus, sonnet and sol. This replaces the builder column in section 4.

**Contract first:** the coordinator wrote `shared/src/agent-wire.ts` and the two agent gateway events before launch, so the connector core builds in wave one beside accounts instead of after wake.

| Wave | Lane | Brief | Builder | Starts | Reviewer |
|---|---|---|---|---|---|
| 1 | Accounts and the wall | `accounts.md` | opus, high | now | sol |
| 1 | Markdown | `markdown.md` | terra, high | now | sonnet |
| 1 | Connector core and CLI | `connector-core.md` | terra, high | now | opus |
| 2 | Stream and wake engine | `wake.md` | sol, high | accounts merged | opus |
| 2 | Agent presence and the guide | `agent-ui.md` | sonnet, high | accounts merged; its walk after wake merges | terra |
| 3 | Connector live and its walks | `connector.md` | terra, high | wake merged | (covered by the core's review) |

Wave close: wave one's test lanes are the server wall (terra, accounts slice) and the client and connector (sonnet, markdown and connector core); later waves' test lanes are chosen at their close. Product acceptance is judged by a family other than the slice's builder.

**Grok too (Trey, 2026-10-27, mid-build):** "use some groks too … I got an absurd amount of usage on mi grok sub", through the `delegate` CLI (Grok 4.7 on Grok Build, his X Ultra plan; a `work` run in a throwaway worktree with commits refused and a read-only brief, never `grok safe`). Grok takes the reviews of the wake engine, the whole connector (one review after the live lane, replacing the planned opus review of the core alone), and agent presence and the guide, plus the guide's stranger read.

Actual wave one, as run: markdown (terra) built, reviewed (sonnet), fixed (terra), tested (sonnet); connector core (terra, partial by design: live verification is wave three); accounts (opus) built, its security review (sol) running at the time of writing, wall tests (terra) written and merged.
