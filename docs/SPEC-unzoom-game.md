# Spec: Unzoom, a new daily game

Written 2026-11-17 on Fable. Built by the same Opus builder, **after** `docs/SPEC-conveyor-game.md` is finished and its gate is green. Everything in that spec's "Read first", "Branch and limits" and commit rules applies here too; this file only says what is different. Nothing is deployed without Wes's word.

## His words (the spec)

> "another one I have is like unzoom or some shit like that, where it's basically a picture super, super, super zoomed in, and you have to guess what you think it is, and it will slowly, like, if you fail, it'll unzoom a little bit, then unzoom a little bit more if you fail, and it's basically seeing who can solve it the fastest."

Check the finished build against each phrase:

1. "a picture super, super, super zoomed in": the first view is a tiny patch of a real photo, close enough that it is mostly texture.
2. "you have to guess what you think it is": you type what the thing is.
3. "if you fail, it'll unzoom a little bit, then unzoom a little bit more": every wrong guess pulls the camera back one step. Small steps early. You watch it pull back; it does not just swap pictures.
4. "seeing who can solve it the fastest": the board is a race. Time is on the result and on the board.

## The game, decided

Working name **Unzoom**, id `unzoom`. Display name in one constant.

- **Start screen:** two lines of rules and Start. The clock starts when the first view is served. One play per day, one picture per day, same picture for everyone, midnight New York turnover.
- **Six views.** View 1 shows about 4% of the photo's width; each step shows roughly twice as much (4, 8, 16, 32, 60, 100%). View 6 is the whole photo.
- **Guessing:** one text box, Enter to guess. Wrong guess: it is added to a small list of your guesses, and the picture pulls back one step. A "Skip" button does the same without typing. Right guess: done. Wrong on view 6: done, answer shown.
- **The pull-back:** when a new view arrives, it starts scaled so the old patch fills the frame exactly, then eases out to the full new view in about 600 ms. The server sends, with each view, where the previous view sits inside it (a rectangle), which gives nothing away. Reduced-motion: cross-fade.
- **Matching:** the same forgiving matcher as Conveyor. Move it to one shared file (`shared/src/match.ts`) and have both games use it. Each picture has a name and aliases ("pineapple"; "tyre", "tire", "wheel").
- **Result:** the full photo, the answer, "Solved on view 3 of 6 in 0:21", your guesses, and the photo credit (author and licence). The credit appears only after the game ends, since it can give the answer away.
- **Ranking, a judgment call flagged for Wes:** fewest views first, time breaks ties, both shown. Reason: on pure time, the winning move is to mash Skip to view 6. If he wants pure time, it is one comparator; keep the sort in one function.
- **Board:** today ranked as above; all time shows solve rate, average view, average time, streak.
- **Share text:** name, day number, "3/6 in 0:21", and six squares (wrong, wrong, right, then blank).

## The server is the referee, and the photo is the secret

The client must never receive more of the photo than the player has earned. So:

- The six views are **six separate image files, cut ahead of time** by the stock script, each with a random file name that does not contain the subject, the view number or the picture id. No image library on the server.
- `stock.json` (in git, `server/src/unzoom/stock.json`) holds, per picture: id, name, aliases, the six file names, the five "previous view sits here" rectangles, author, licence, source page.
- The route serves view N's file only to a user whose play for today has reached view N. The play row tracks the current view. The answer, the credit and the later file names are never in a response until the play is over.
- `start` stamps the time. Each guess is judged on the server and stamped. Time = solve stamp minus start stamp. Reload resumes at the current view with the clock still running.
- Daily pick: first opener of the day takes a random unused picture and saves it in `unzoom_days` (same as Third Degree's pool). When the pool is empty, reuse the least recently used.
- Tables `unzoom_days`, `unzoom_plays` (user, day, view reached, guesses, started, finished, solved); migration `0038_unzoom.sql`.

## Pictures

Real photographs, not generated ones and not the emoji set: a zoomed-in drawing is a flat colour.

- New script `scripts/unzoom-stock.py`, modeled on `scripts/geo-stock.py`. Input: a hand-written list in the script (or a small YAML beside it) of subject, aliases, a Wikimedia Commons file title, and a **focus point** (x, y as fractions) where view 1 is centred. Pick focus points on texture that is fair but not obvious: the eye of the pineapple, the tread of the tyre, not blank sky and not a logo or any text.
- The script asks the Commons API for each file's licence and author, keeps only public domain, CC0, CC BY and CC BY-SA, downloads the original once, cuts the six views centred on the focus point (clamped to the image edges, each view inside the next), saves them at 900 px wide as JPEG with the metadata stripped, and writes `stock.json`. Use a generic User-Agent with no name or email in it.
- Photos live where the Whereabouts photos live, in a new `unzoom` folder: on this PC under `Documents\Scryproof-keep\game-photos\unzoom`, on the box under `GAME_PHOTOS_PATH`. They are not in git. They reach the box by `scripts/publish-game-photos.sh`, which is a deploy step and waits for Wes's word; add the folder to that script but do not run it.
- **45 pictures** for round one (six weeks). Subjects anyone can name: fruit, animals, tools, instruments, sports gear, food, household things, vehicles. Mix easy and hard.
- After cutting, build one contact sheet of every picture's view 1 and view 3, look at it once, and re-point any view 1 that is blank, blurry or a dead giveaway. Check every slot is filled and none repeats.

## Files

Same registration list as the Conveyor spec, with `unzoom` in place of `conveyor`, plus the photo route (model: `/api/rounds/photo/:file` in `server/src/routes/rounds.ts`, with the "has this user reached this view" check added) and the stock script.

## Branch

Branch `unzoom-game`, cut from the finished `conveyor-game` branch (both games edit the same registration lines, so they stack instead of running side by side). Separate commits per phase.

## Phases (each ends runnable, with a screenshot in `docs/shots/`)

1. **Feel first, three test photos.** Stock script working on three pictures; the game playable client-side with the pull-back animation. Check: screenshots of view 1, view 3 and view 6 of one picture.
2. **Server referee.** Tables, migration, routes, gated photo serving, server clock and judging, `game_done`. Check: server test covering: view 2's file refused before a wrong guess and served after; answer absent from every response before the end; time measured from the server stamps; second play refused.
3. **Board, share, commands, How to play.** Check: two test users finish on different views; screenshot of the board and the share text.
4. **Stock to 45.** The list, the script run, the contact sheet look. Check: a test asserts all six files exist for every stock entry and no two pictures share a name or alias. Put the contact sheet in `docs/shots/`, since it shows answers keep it out of the app.
5. **Gate.** Play one day by hand in the dev build, screenshot the result screen, then `scripts/release.sh --check-only` once.

## Stuck rule

Same as Conveyor: 20 minutes on one thing means take the simplest version that keeps his four phrases true and note it. If the Commons API or downloads are blocked, stop stocking at however many pictures landed (three is enough to ship the build for review) and say so. Hard cap: 90 minutes. No questions back.

## Later, not now

- More than one picture a day.
- Pictures from Wes and friends (their own photos as puzzles).

## Summary (builder fills this in, plain English, for Wes)

- What you can do now:
- What it looks like (screenshot paths, contact sheet path):
- What was cut or simplified, and why:
- Pictures stocked, last day covered, licences:
- Test gate result:
- Commits and branch:
- What needs his word (photo publish, release, the ranking call):
