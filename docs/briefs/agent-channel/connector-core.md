# Lane brief: the connector core and CLI, built against the contract (wave one)

Read `docs/briefs/agent-channel/preamble.md` first, then `docs/briefs/agent-channel/connector.md`, which is the whole connector job. This lane builds as much of it as can be built before the server's agent routes and stream exist; a later lane (likely continuing your branch) wires it to the real server and does that brief's three walks. Ports for this lane: API 8814, web 5184, data dir `.data-connector`.

## Why this lane exists now

The accounts lane (agent routes, bearer auth) and the markdown lane are running beside you, and the stream and wake engine come after accounts. The wire shapes they will speak were fixed first in `shared/src/agent-wire.ts`, so the connector can be built now against that contract instead of waiting two slices.

## Build

Everything in `connector.md` and spec 6.5 for the first release, against the contract:

- The `connector/` workspace package: added to the root `package.json` workspaces and to `npm run typecheck`; `npm run build --workspace connector` bundles one file with esbuild (bundling `shared/`), and a `bin` entry exposes it as `scry`. `node:` built-ins only; no MCP library.
- **The renderer goes in `shared/`**, as `shared/src/agent-render.ts` exported from `shared/src/index.ts`: the 5.6 gutter rendering as a pure function of the messages, the alias map, the member's time zone and "now" (so the same input always gives the same bytes), the 1,200-character body cut with its read-more hint, and a size function and a budget cutter that never cuts mid-message. The wake lane's server code will measure wake and catch-up budgets with your size function, so it must not depend on anything outside `shared/`.
- Profile, config and credentials (0600, re-asserted on write), the token resolution order, HTTPS-only except loopback, aliases persisted in the profile's state file.
- The bearer client, the error envelope and exit-code mapping, idempotency keys (auto-generated, one retry on timeout), `--dry-run`, `--output`, `--verbose` JSONL on stderr, did-you-mean, bounded output.
- Commands `connect`, `me`, `read`, `send`, `poll`, `vote`, `react`, `wait`, `serve claude`, `doctor`, `schema`, exactly as `connector.md` limits them. `poll` posts the same `/poll` text a person would type (read `shared/src/polls.ts` for the grammar).
- The stream client: SSE parsing, reconnect with backoff, subscribe-then-snapshot catch-up with de-duplication by id, the delivered-then-read watermark, the once-per-start framing line.
- Face A, the Claude Code channel: a hand-written stdio MCP server following `docs/spikes/claude-channel-probe/probe-server.mjs`, with the tools whose commands exist in this release (`reply`, `read`, `me`, `poll`, `vote`, `react`), channel instructions under 120 words, wakes pushed as `notifications/claude/channel`. Read the current channels reference at https://code.claude.com/docs/en/channels-reference before writing it.
- One wake face per token (`serve` refuses with the other's pid; `wait` counts as a face while it runs), and `doctor` with every check that does not need a live stream (the stream check is written now and proven live in the next lane).

## What you cannot do yet, and what to do instead

There is no server to talk to: the agent routes are being built beside you. Exercise the CLI by hand against the shapes in the contract, with a throwaway stand-in server in `$TMPDIR` if that helps you see real output (do not commit it). Run `scry` with no arguments, `scry schema`, `scry doctor` with no profile, `scry connect` refusals (plain `http://` to a non-loopback host, an existing profile without `--replace`), and `scry serve claude` answering `initialize` and `tools/list` on stdin. Put those transcripts in `docs/shots/agent-connector/core-transcripts.txt`. The Claude Code and Loom walks in `connector.md` are the next lane's, not yours.

## Not in this lane

Anything on the server (routes, stream, wake), the web client, the guide page, the walks against a live server, and anything `connector.md` leaves out of the first release (`card`, `voice`, `file get`, `send --file`, `serve mcp`, compiled executables, the installer, publishing).
