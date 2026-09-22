# Visual pass, wave two: B is the base

Written 2026-09-22 after Wes picked direction B ("I like B the most right
now. Not crazy about that specific background image but it could always be
saved as a 'theme' someone could choose. I do like the function at the
bottom of C where it kinda reminds you what channel you are chatting in.")

`main` now *is* direction B: warm tokens at the top of `web/src/styles.css`,
the `.ambient` layer (vignette → gradient → `/backdrops/hall.svg`, 30s
hearth flicker on `::after`), panels at 0.82/0.93 alpha, Cormorant for the
display face. Read `docs/briefs/README.md` for the agent rules, then
`docs/briefs/visual.md` for the design rules (the "rules every direction
obeys" section still holds), then your section here. Read `styles.css`
top to bottom once: you are extending this look now, not replacing it.

Screenshot loop as before: `npm run dev --workspace web -- --port PORT`
then `WEB_URL=http://localhost:PORT DEBUG_PORT=DPORT node scripts/shot.mjs
docs/shots/<name>.png`. The API is on 8787, seeded, sign in as `wes`.
`WINDOW=390,844` and `--signed-out` exist. Kill vite before reporting.
Never run dev-restart, seed, smoke, dm, desktop.

## The theme contract (everyone follows this)

A theme is:

1. One file `web/src/themes/<id>.css` containing exactly one
   `:root[data-theme="<id>"] { … }` block that sets **every** token the
   `hall` theme sets (the list is whatever `web/src/themes/hall.css`
   declares once job 1 has moved them there; until then, the `:root`
   block at the top of `styles.css` is the list, plus `--backdrop`).
   Backdrop-bearing tokens: `--backdrop: url("/backdrops/<id>.svg")` or
   `none`; `--backdrop-position` (e.g. `center 24%`); `--panel-alpha`
   (0.82 for a backdrop theme, 1 for a flat one); `--glow-color` (the
   flicker layer's colour, or `transparent`).
2. Optionally `web/public/backdrops/<id>.svg`, written by a deterministic
   `web/scripts/gen-<id>-backdrop.mjs` (seeded PRNG, 2560×1440, under
   150 KB, composition upper-middle, bottom third dark because panels
   sit there). Commit both.
3. One entry for `web/src/lib/themes.ts`: `{ id, name, mood }` where
   `mood` is one line, under twelve words, no adjectives stacked three
   deep. Put the entry in your report; the main session wires it.

Text always wins: 4.5:1 for `--text` on the panel at its alpha over the
brightest part of the backdrop that can sit under the message column.
Check it by screenshot with the panel over the brightest region.

## 1. `theme-system` (port 5184, debug 9364)

Branch `visual-themes`. Move the `:root` tokens into
`web/src/themes/hall.css` as `:root[data-theme="hall"]`, keep `:root`
itself as a copy of hall so a page with no attribute still paints (first
frame, tests). Make `.ambient` read `--backdrop`, `--backdrop-position`,
`--glow-color`, and the panels read `--panel-alpha`. Add
`web/src/themes/plain.css`: the same warm palette, `--backdrop: none`,
alpha 1, for anyone who wants the room without the painting. Add
`web/src/lib/theme.ts` (persist in `localStorage` key `scryproof.theme.v1`,
mirror how `voice-prefs.ts` does it; apply to `<html>` before first render
via an import in `main.tsx`) and `web/src/lib/themes.ts` (the list). Add a
Themes modal reachable from the user menu at the bottom of the sidebar
(read `UserPanel.tsx` to see how Voice / Notifications open): a card per
theme that paints itself by carrying its own `data-theme` attribute, the
name, the mood line, "in use" on the current one. Cards for backdrop themes
show a thumbnail of their SVG. Screenshots: the modal, and the main screen
in `plain`.

## 2. `backdrop-scry` (port 5185, debug 9365)

Branch `visual-scry`. Theme id `scry`. Scryproof is named for scrying.
Paint the scrying chamber: a dark stone room, a low wide basin at
upper-middle with pale water throwing cool light up onto the walls, a few
guttering candles for warmth at the edges, nothing figurative in the
water. Cool tokens to match (blue-black surfaces, ink with a violet cast,
accent a pale scry-light, gold stays for ornament). Do not touch
`styles.css` beyond what job 1's contract needs; if the contract's tokens
are not in place yet on your branch, write the block against the current
`:root` list and add `--backdrop`, `--backdrop-position`,
`--panel-alpha`, `--glow-color` anyway. Screenshot with your theme forced:
add `data-theme="scry"` to `<html>` in `web/index.html` **only on your
branch and revert it before committing**, or set it from the shot script
with `--press` of nothing… simplest: temporarily set it in `index.html`,
shoot, revert.

## 3. `backdrop-ridge` (port 5186, debug 9366)

Branch `visual-ridge`. Theme id `ridge`. A campfire on a high ridge at
night: warm fire low-centre-left, a cold star field and far ridgelines
above, sparks. The foreground warmth and the sky's cold are the point.
Warm-neutral tokens (charcoal with a red-brown cast, accent the fire's
orange, a cold `--text-dim`). Same constraints and screenshot method as
job 2.

## 4. `composer-label` (port 5187, debug 9367)

Branch `visual-composer`. Read `git show visual-c:web/src/components/Composer.tsx`
and `git show visual-c:web/src/styles.css` (search `composer-label` or
similar) to see how direction C put `# channel` / `@ name` inside the
composer as a prompt-style label before the text field. Rebuild that on
the B base: the label sits inside the composer's left edge in `--mono`,
small caps or lowercase, `--text-dim`, a hairline to its right, and the
placeholder becomes "Write something". DMs show `@ name`. Do not bring
anything else from C. Screenshot the main screen and a DM.

## Report

Branch, commit, shots, the `themes.ts` entry if you made a theme, and
anything you could not make work.
