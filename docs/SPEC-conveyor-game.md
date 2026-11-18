# Spec: Conveyor, a new daily game

Written 2026-11-17 on Fable from a Sonnet survey of the daily games. One Opus builder builds it from this file. Nothing here is deployed without Wes's word.

## His words (the spec)

> "I got another game we can add to the daily games. It's basically the conveyor game where like 20 items come by on the screen. Like a picture and the text. It goes through and then you have a minute to recite how many you saw."

Check the finished build against each phrase:

1. "add to the daily games": it sits in the Games folder with the other eight, same shell, same Today / All time board, same slash command pattern.
2. "the conveyor game": things ride past on a belt. It looks like a belt moving, not a slideshow.
3. "like 20 items": 20 a day.
4. "a picture and the text": every item shows its picture and its name together.
5. "It goes through": one pass, no pause, no rewind, no second look.
6. "then you have a minute": a 60-second clock starts when the last item leaves.
7. "recite how many you saw": you name as many as you can. Score is how many of the 20 you got.

## The game, decided

Working name **Conveyor**, id `conveyor`. (The other games have joke names; Wes may rename it. Keep the display name in one constant.)

- **Start screen:** rules in two lines and a Start button. Nothing moves until Start. One play per day.
- **The belt:** 20 items slide across, right to left, at a steady speed, evenly spaced, about three on screen at once on desktop and about two on a phone. Each item is a picture on a tray with its name under it. Whole belt takes about 55 seconds. A small "7 / 20" counter is fine; no item list anywhere.
- **Recall:** the belt empties, a 60-second clock appears with one text box, focused. Type a name, press Enter. A hit drops that item's picture into a row of found items and the count goes up. A miss shakes the box lightly and costs nothing. A repeat says "already got it". Enter on an empty box does nothing. A "Done" button ends early.
- **Matching is forgiving:** ignore case, spaces, hyphens and a trailing "s"; accept each item's listed aliases ("sofa" for couch); accept one wrong letter on names of five letters or more. The matcher is one function in `shared/` used by both client (instant feedback) and server (the score that counts).
- **Result:** "14 / 20", then the full belt in order with the ones you got lit and the ones you missed dim, so you see what slipped by. Share text is the name, day number, score, and a row of 20 squares in belt order, filled for remembered. Same "Copy result" / "Put in #channel" buttons as the other games.
- **Board:** today's finishes ranked by score; all time shows average, best, days played, streak. Copy how Third Degree does it.
- **Clock is the server's.** `start` stamps the time and returns the 20 items. The belt and the minute run off that stamp, so a reload resumes where the clock is, and leaving the tab does not pause it. Guesses are accepted until start + belt time + 60 s + 5 s grace. Finish with no guesses scores 0. The server recomputes the score from the typed guesses; the client's count is display only.
- **Daily pick:** same 20 for everyone, midnight New York turnover like the rest. The first opener of the day picks 20 from the bank, seeded, spread across categories (no more than 4 from one), skipping anything used in the last 14 days, and saves the pick in `conveyor_days` so a later bank edit cannot change a day already played.
- **Lookalike rule:** no two items on one day may match each other's names or aliases (no "cup" and "mug" together if they share an alias).

## Pictures

Round one uses an open, vendored picture set so the game is playable today. Builder: check the licence file yourself before committing anything.

- First choice: Microsoft Fluent Emoji, the flat SVG style (repo `microsoft/fluentui-emoji`, MIT as far as Fable recalls; verify). Fallback: Noto Emoji SVGs (Apache 2.0; verify).
- Download once on this PC, pick roughly 300 **objects, food, animals, vehicles, tools, clothes, instruments**. No faces, flags, symbols, hands, people or anything whose name is a guess ("label", "receipt" are fine; "input symbols" is not). Every pick must be something a person would name in one or two plain words.
- Commit the chosen SVGs into the repo (`web/public/conveyor/` or wherever static game art already lives) with the licence file beside them. Nothing is fetched at runtime; no CDN. This is non-negotiable 1.
- Bank file: `server/src/conveyor/bank.ts`, an array of `{ id, name, aliases, category, file }`. Write names by hand, not from the emoji metadata: "Couch", not "Couch and Lamp". If an array gets long, it is an array literal, never a `+` string chain (that froze the box once; HANDOFF 3959).
- The picture set is behind one folder and one bank file so it can be swapped for our own art later without touching the game.

## Read first

- `CLAUDE.md` non-negotiables, `PAPERCUTS.md` rules.
- Toolbox row "Web/canvas game" in `~/.claude/skills/toolbox/SKILL.md`; invoke `ponytail`, `game-feel` (the hit, the miss shake, the belt) and `game-ui-ux`. The repo has no GSAP; do the belt with CSS transforms or the Web Animations API unless an animation library is already a dependency.
- Third Degree end to end, as the model: `shared/src/thrice.ts`, `server/src/thrice/thrice.ts`, `server/src/routes/thrice.ts`, `web/src/components/Thrice.tsx`, schema `thrice*` at `server/src/db/schema.ts:1140`.
- Shared pieces: `GameShell.tsx`, `GameHead.tsx`, `GameBoard.tsx`, `web/src/lib/daily.ts`.

## Files to touch (from the survey; line numbers may have drifted)

- New: `shared/src/conveyor.ts` (name, firstDay, day number, timings, matcher, share text, types) and an export in `shared/src/index.ts`.
- New: `server/src/conveyor/{conveyor,bank}.ts`, `server/src/routes/conveyor.ts`; register in `server/src/app.ts` (import near 46, call near 269).
- `server/src/db/schema.ts`: `conveyor_days`, `conveyor_plays` keyed on (user, day); migration `0037_conveyor.sql`, hand-checked. Restart the dev API after adding it.
- `web/src/lib/api.ts` (block like `thrice` near 673), `web/src/lib/daily.ts` (near 72).
- New: `web/src/components/Conveyor.tsx` exporting `ConveyorGate`; mount in `web/src/App.tsx` (near 437).
- `web/src/components/GameHead.tsx:14` (id and rules text), `web/src/components/Games.tsx:53` (`ALL_GAMES` entry and the store import).
- Commands: `web/src/lib/commands.ts` (Game type near 96, aliases, command list), `web/src/components/Composer.tsx` (three lookups near 16, 321, 690), `web/src/state/store.tsx` (near 46, 189, 1619).
- `shared/src/gateway.ts:184`: add the id to the `game_done` union.
- Tests: `web/src/tests/commands.test.ts`, a server test modeled on `server/src/tests/games.test.ts`, and a matcher test.
- `web/src/changelog.ts`: write the entry, plain words, but leave the date for release day.

## Branch and limits

- `git fetch` and read what landed since `50dc428` before starting.
- Work in a git worktree on branch `conveyor-game`. The main folder has two uncommitted files (`docs/box/if-the-pc-dies.md`, `scripts/loaf-collage.py`); do not touch them.
- Do not touch voice, E2EE, auth, deploy scripts, or any other game beyond the registration lines listed above.
- No new npm dependency.
- This PC has 16 GB. Read free RAM before the test suite or any browser check; under 4 GB free, run it alone. One browser at a time.
- Commits are plain messages: no Co-Authored-By, no session links, no "Generated with" lines.
- No `release.sh`, no `publish` script, no push to the box. Building, testing, committing on the branch and pushing the branch to GitHub are fine.

## Phases (each ends runnable, with a screenshot in `docs/shots/`)

1. **The belt, fake data.** Game shows in the Games folder; Start runs a belt of 20 hard-coded items, then the minute, then a score, all client-side. Check: screenshot mid-belt at desktop width and at 390 px wide; both show picture and name readable.
2. **The bank.** Pictures vendored with licence, about 300 items in `bank.ts`. Check: a script or test asserts every bank entry's file exists, ids are unique, and no name or alias is shared by two items.
3. **Server and the day.** Tables, migration, routes, daily pick, server clock, server scoring, `game_done`. Check: server test covering same 20 for two users, late guess refused, reload resumes, score recomputed from guesses, second play refused.
4. **Board, share, commands.** Today / All time board, share text, slash command and aliases, How to play text. Check: two test users finish; screenshot of the board and the pasted share text.
5. **Feel.** Belt motion, tray art, hit and miss feedback, the reveal at the end. Respect reduced-motion (items step across instead of sliding). Check: play one full day by hand in the dev build and screenshot result screen; then the gate once, `scripts/release.sh --check-only` (or `npm run typecheck && npm test`), at the very end.

## Stuck rule

Solve your own problems. If one thing eats 20 minutes, take the simplest version that keeps his seven phrases true, note it in the summary, and move on. If the picture set's licence does not check out or the download is blocked, use the fallback set; if both fail, build phases 1 and 3 to 5 with 40 placeholder items and stop there. Hard cap: 90 minutes of building. Do not come back with questions.

## Later, not now

- Our own drawn pictures in place of the open set.
- Saying the answers out loud instead of typing ("recite"). Would need on-device speech; nothing leaves the box.
- Harder days (faster belt, 25 items) and themed days.

## Summary (builder fills this in, plain English, for Wes)

- What you can do now:
- What it looks like (screenshot paths):
- What was cut or simplified, and why:
- Picture set used, licence, how many items:
- Test gate result:
- Commits and branch:
- What needs his word (release, anything else):
