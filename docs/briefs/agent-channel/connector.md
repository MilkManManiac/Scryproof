# Lane brief: the connector, its CLI, and the Claude Code channel (spec phase 2, member's machine)

Read `docs/briefs/agent-channel/preamble.md` first. Ports for this lane: API 8814, web 5184, data dir `.data-connector`. You start from the merged accounts and wake lanes: the whole agent API and the stream exist on the server.

## The job

Build `connector/`, the small program each member runs on their own machine. It holds the agent's token, keeps the stream open, turns compact wire messages into the short text a model reads, and gives the agent two ways in: as a Claude Code channel (wakes arrive in the running session by themselves) and as a CLI (`scry …`) that any harness can call, including Loom, which waits on `scry wait`. When this lane is done, Trey's vanilla Claude Code and a Loom agent can both sit in the flagged channel on his local build and answer when mentioned.

## Spec sections you implement

5.5 (the connector's side of every agent route that exists), 5.6 (all: rendering, aliases, budgets, delivered-then-read watermark, subscribe-then-snapshot catch-up, the once-per-start framing line, channel instructions under 120 words), 6.5 (the contract, the core, Face A and Face C), with these limits for the first release:

- Commands in this release: `connect`, `me`, `read`, `send` (text, `--re`, `--idempotency-key`, `--dry-run`; no `--file`), `poll`, `vote`, `react`, `wait`, `serve claude`, `doctor`, `schema`. Not in this release: `card`, `voice`, `file get`, `send --file`, `serve mcp` (the plain-MCP face), compiled single-file executables and the `curl | sh` installer. `scry schema` lists only what exists.
- Install for the first release: from a checkout of this repo. `npm run build --workspace connector` produces one bundled file (esbuild, already a dev dependency of the server, bundling `shared/`), and a `bin` entry exposes it as `scry`. Publishing to npm or shipping binaries is a later decision and an external release; do not do it.

## Decisions already made

- **No MCP library.** The Claude Code face speaks the small part of MCP it needs (initialize, `tools/list`, `tools/call`, `ping`, and the `notifications/claude/channel` push) over stdio with our own code, as `docs/spikes/claude-channel-probe/probe-server.mjs` does against Claude Code 2.1.310. That keeps a large dependency tree off members' machines, which hold their agent tokens. Negotiate the protocol version the way the probe does. If you hit a concrete protocol problem the hand-written path cannot handle, stop and report it with the evidence rather than adding the library.
- No other dependencies. `node:` built-ins only (fetch, streams, readline, fs, crypto).
- The token goes over HTTPS only, except to a loopback address (`127.0.0.1`, `localhost`, `::1`) for local development. Plain `http://` to any other host is refused with a message naming the risk.
- Connectors talk to the server origin directly, never through the desktop app's forwarder.
- CLI aliases (`m1`, `m2`, …) persist in the profile's state file so `scry read` followed by `scry send --re m4` works across separate processes; `scry connect` and the start of `scry serve claude` begin a fresh map. Full ids never appear in model-facing text.
- The UI and `doctor` say "connector online", never "listening": Claude Code gives no acknowledgement (see the probe README).
- One wake face per token at a time: `serve` refuses with the pid of the other, and `doctor` reports it.

## Where things are

- The probe server and what it proved: `docs/spikes/claude-channel-probe/`.
- Claude Code channel reference (current docs, read them, do not rely on memory): https://code.claude.com/docs/en/channels-reference. Face A requirements to state in the instructions and the guide: an interactive session, started with `claude --dangerously-load-development-channels server:scryproof`, with the warning dialog accepted; ignored under `-p` and the Agent SDK; Team/Enterprise need `channelsEnabled`. Generate the `.mcp.json` entry (with a per-server `timeout`) from `scry connect` output or `scry doctor --fix`'s report, not by editing the member's files silently.
- The house's agent-CLI rules the contract came from: `~/.claude-shared/skill-library/agent-ergonomics-and-intuitiveness-maximization-for-cli-tools/` and `~/.claude-shared/skill-library/rust-agent-cli/` (read for the contract rules; the language stays TypeScript).
- Shared rules to reuse, not copy: limits, mention grammar, poll parser and the rendering size function the wake lane put in `shared/`.
- Add `connector` to the root `package.json` workspaces and to `npm run typecheck`.

## Tests (each new one red-proofed)

- CLI contract: parser cases including conflicts and bad values; black-box runs that parse every stdout and stderr envelope; the `schema` snapshot; one regression test per first-try behaviour in 6.5 and per error with a `suggested_fix`; non-TTY, `NO_COLOR` and `TERM=dumb` change nothing; stdout stays clean under `--verbose`.
- Rendering: ids never in text, headers unforgeable by a body, aliases round-trip, the same messages always render to the same bytes, budgets and truncation with the exact read-more command.
- Subscribe-then-snapshot: messages arriving during catch-up are neither lost nor doubled.
- Idempotency: a send retried after a timeout posts once.
- Round trip against a local server on your ports: connect, read, send, mention-wake through `wait`, mark read.

## The walk you record (capture directory `docs/shots/agent-connector/`)

1. **Claude Code.** On your ports, with a seeded agent token: `scry connect <token> --server http://127.0.0.1:8814`, write the `.mcp.json` entry in a scratch folder, and start `claude --dangerously-load-development-channels server:scryproof` in a pseudo-terminal (`pty: true` on the bash tool; accept the folder-trust and development-channel dialogs as the probe README describes). As a seeded human in the app, @-mention the agent; the wake appears in the session and the agent replies through the `reply` tool; the reply shows in the app. Keep the terminal recording (Loom saves `recording.cast` for a pty job; copy it in) and a screenshot of the channel.
2. **Loom.** From your own Loom session (you are one): run `scry wait --max 25` as a background job, `wait` on it with watch, have a seeded human mention a second agent token, take the printed wake, answer with `scry send --re …`, and re-arm. Write the recipe you used, step by step, as `loom-recipe.md`; the guide lane copies it.
3. `scry doctor` output against a healthy profile and against a revoked token.
