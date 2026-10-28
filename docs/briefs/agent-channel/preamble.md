# Agent channel, first release: shared brief for every lane

This block heads every lane brief in this build. Read it, then your own brief, then only the code your brief names and what it imports.

## Vision

**What we are building:** one channel in Scryproof where members and the AI coding agents they already run talk together. A member creates an agent account in Settings, gets a token, and connects their agent (vanilla Claude Code first, Loom too) through a small connector program on their own machine. The agent reads, posts, is @-mentioned and replies in that one flagged channel; its owner decides whether it is woken by every message, by mentions only, or never. This build is the first release: spec phases 1, 2 and 3 (accounts and the server-side wall, live wake-ups and the connector, markdown rendering). Phases 4–7 are out of scope.

**Why:** we spend our days talking to our agents one-on-one, and what they find, build and draft never reaches each other or the group except by copy-paste. A shared room closes that loop inside the Discord we already built. It is also the "ours" priority: nobody else's bot platform.

**For whom:** Wes, Matt, Trey and the rest of the friend group, each with their own agent. Trey dogfoods the first release locally before it ships; then the group tests it on the box.

**What must be true when it is done:**
- Trey creates an agent in Settings → My agents, picks a server, flags a channel, and his agent posts there with the 🤖 badge.
- Two of Trey's agents (vanilla Claude Code, and Loom or a second Claude Code) hold a conversation with Trey in the channel on his local build; an @-mention wakes an agent within a second; "never" silences it live and on reconnect; six agent messages in a row pause the agents until a person posts.
- Agents cannot see or touch anything outside flagged channels: every unflagged channel is a 404, no role, override, ownership or admin bit raises an agent above the ceiling, and a human cannot give an agent a role, a DM or ownership.
- Code blocks, tables and lists that agents write render properly on PC and phone, and the client still never turns a message into HTML.
- A member can follow the in-app "Connect your agent" guide and get connected without help.
- Trey's first look at the accounts slice, and his dogfood of the whole release, in his own words.

**What exists that this replaces or extends:** extends the running Scryproof app (server `server/`, client `web/`, shared rules `shared/`): its accounts, sessions, server-computed permissions, message model, mentions, read states, attachments, polls, gateway hub, Settings panels and Guide. Nothing is replaced. The spec is `docs/agent-channel-spec.md` (draft 3, amended 2026-10-26); GAMEPLAN.md and CLAUDE.md's non-negotiables still govern, with the one accepted exception in spec 5.11.

**Stack:** the repo's own: Node 22 + TypeScript, Fastify, `ws`, Drizzle on Postgres (PGlite in development), React 19 + Vite, `node --test` with `tsx`. The connector is a new TypeScript package in this repo (`connector/`) sharing `shared/`, for the reasons in spec 6.5 (one copy of every validation rule; the house Rust-CLI default is not taken). Against `~/.claude-shared/reference/house-stack.md`, the closest TypeScript CLI precedent is webqa.

## Working rules for every lane

- Read `CLAUDE.md` and its non-negotiables first. Permissions are computed on the server; the client only hides buttons. No third-party service, nothing that phones home.
- Your brief names your spec sections. The spec is the authority on behaviour; if the code disagrees with the spec's claims about the code, say so in your report and do the closest right thing.
- Match the code around you: comment density, naming, plain-English error messages, comments that explain why in sentences. No emoji in code or copy except the agent badge 🤖.
- No new dependencies, except where your brief allows one by name. The committed `.npmrc` (install scripts off, seven-day release cooldown) applies; install with `npm ci`. Any allowed dependency is justified in the commit message.
- Run your own servers on your own ports so lanes never collide: API with `PORT=<your API port> DATA_DIR=.data-<lane> npm run dev:server`, web with `API_PORT=<your API port> npx vite --port <your web port>` from `web/`, seed with `SEED_BASE=http://127.0.0.1:<your API port> npm run seed`. Your brief gives the ports. Never run `scripts/dev-restart.sh` or anything on the default ports 8787 and 5173.
- **You write no tests** (Trey, 2026-10-27, for this build): straight product code. No new test files, no new cases in existing ones, no edits to test files, no smoke-script additions. Your brief's "Tests" list is input for the test lanes that run at the end of each wave with the `test-value-audit` skill and write only the few tests worth keeping; leave that list to them. Your brief's walk (curl transcripts, screenshots, recordings) is product evidence, not a test: do it.
- What you run: `npm run typecheck`, and the existing test files for the code you change and their close neighbours, through testrun: `testrun scryproof unit-<lane> -- node --import tsx --test <files>` (server files from `server/`, web files from `web/` with `--experimental-test-module-mocks`). If an existing test fails because the spec deliberately changes the behaviour it asserts, leave the test alone and list it in your report with the reason; if it fails for any other reason, your code is wrong. Not the whole suite and not the project gate; the coordinator runs those once on the integrated build. You may poke your work by hand however you like (curl, a throwaway script in `$TMPDIR`); do not commit those.
- The wire contract `shared/src/agent-wire.ts`, and the `agent_status` and `channel_agents_paused` events and the ready frame's `agents` field in `shared/src/gateway.ts`, were written before the build. Build to them. If you need a field that is not there, add it and say so in your report; if you think a shape is wrong, say why in the report rather than quietly reshaping it.
- Screens: if your brief has a surface, photograph each state with `scripts/shot.mjs` (`CHROME="$(bash scripts/find-chrome.sh)" WEB_URL=http://localhost:<your web port> node scripts/shot.mjs <out.png> --as wes ...`; on this Mac the "Google Chrome" in Applications is a broken shortcut, so always go through `find-chrome.sh`) at the default laptop size and at `WINDOW=390,844`, into the capture directory your brief names. Look at every picture yourself before you report.
- Commit on your branch at coherent checkpoints, subject a sentence of 72 characters or fewer, body in whole sentences stating what verification ran and its counts. Stage files by name. Do not push. Do not edit `docs/HANDOFF.md` or `STATE.md`; the coordinator writes those.
- Report: branch, final commit, files changed, the exact output of your checks, existing tests your change deliberately broke (name and reason), the screenshots taken, the behaviours you think most deserve a test and why (one line each; the test lane reads this), and anything you were unsure of or decided that the brief did not.
