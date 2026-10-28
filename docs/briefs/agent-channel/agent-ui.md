# Lane brief: what people see of agents, and the "Your agent" guide (spec phase 2, web side)

Read `docs/briefs/agent-channel/preamble.md` first. Ports for this lane: API 8815, web 5185, data dir `.data-agent-ui`. You start from the merged accounts and wake lanes (and the connector lane if it has merged; if not, write the guide from its brief and the spec, and the cleanup pass reconciles the commands).

**Do not start the guide page until `docs/briefs/agent-channel/guide-outline.md` says Trey gave his go.** The rest of this brief does not wait for it.

## The job

Make agents legible in the app. The member list shows each agent's badge, whether its connector is online, and what wakes it. A channel shows when its agents are paused and who is "thinking…". The guide page teaches a member to connect their own agent with no help from us.

## Spec sections you implement

5.12 (member list connector state and wake mode, the pause banner, the typing line, the guide page), and the web part of 6.2 that the accounts lane did not already build.

## Where things are

- The gateway events the wake lane added for connector online, wake mode, paused and agent typing (read its merged code and report; do not guess the names).
- Member list: `web/src/components/MemberList.tsx` (the accounts lane added the badge). Add "connector online" (a quiet dot and the words, never a colour alone) and "wakes on: mentions" (or "every message" or "never").
- Channel: the pause banner reads exactly **Agents are paused until a person posts.**; the typing line reads **Trey's Scrier is thinking…** with the owner's and agent's names. Find where the existing typing line and channel header are drawn (`MessageList.tsx`, `Composer.tsx`, `ChannelSidebar.tsx` or the channel header component) and follow them.
- The guide: `web/src/lib/guide.ts` (`GUIDE_TOPICS`) and `web/src/components/Guide.tsx`. Add the topic `agents`, titled "Your agent", with exactly the sections in `docs/briefs/agent-channel/guide-outline.md` once approved; open it from Settings → My agents. Command lines are copyable text. The Loom steps come from the connector lane's `docs/shots/agent-connector/loom-recipe.md`; the Claude Code steps from its walk.
- Tests to extend: `web/src/tests/guide.test.ts` and the member-list or gateway-state tests near what you change.

## Decisions already made

- Plain words for members; no internal names (no "Face A", "SSE", "bearer").
- Never claim the model is listening.
- Copy is in the voice of the existing Guide topics.

## Tests (each new one red-proofed)

- The `agents` guide topic opens from `?guide=agents` and from Settings → My agents.
- Member-list state follows the gateway events (online, offline, mode change) without a reload.
- Pause banner appears on pause and goes on a human post; typing line clears after 8 s.

## The walk you photograph (capture directory `docs/shots/agent-ui/`)

On your ports, with two agent tokens connected through `curl -N` streams or the connector: the member list with one agent online and one offline, at laptop and phone width; the typing line; the pause banner after six agent messages and its disappearance after a human post; every section of the guide at laptop and phone width. Then the stranger read: give a fresh agent only the guide's screenshots and the sentence "you are a member of this server who runs Claude Code and has never connected an agent", and record what it could not follow, in `stranger-read.md`.
