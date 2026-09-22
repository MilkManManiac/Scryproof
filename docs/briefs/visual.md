# The visual pass: three directions, built blind of each other

Written 2026-09-22 by the main session. Read `docs/briefs/README.md` for the
agent rules (one job, no new dependencies, nothing phones home, commit on
your branch, do not push, do not touch HANDOFF). Then `docs/visual-plan.md`.
Then `~/.claude/skills/design-research/SKILL.md` and its
`references/web-css.md`. Then this file.

Wes, tonight: "Check everything. Fonts, formatting, size, placement,
background, maybe dynamic backgrounds, etc. Go nuts." And earlier, about
the last app: "Everything about it felt like AI built it, and people notice
that." A default-looking chat app is a failure even if every pixel is tidy.

## How this works

Three agents, three branches, one direction each. You do not read the other
directions and you do not tune the current look: **the wall** (see
`~/.claude/skills/milk-project/references/the-wall.md`) is that a redo made
from the old stylesheet is the old stylesheet with more pixels. Read
`web/src/styles.css` once, for the class names the components use and the
token layer at the top, and then write your own. Replacing the file wholesale
is allowed and expected for B and C. Components (`web/src/components/*.tsx`,
`web/src/screens/*.tsx`) may change where the direction needs it.

You can see your work. The main session runs the API on port 8787 with the
seeded database. In your worktree:

    npm run dev --workspace web -- --port PORT

with the PORT this brief gives you, then

    WEB_URL=http://localhost:PORT DEBUG_PORT=DPORT node scripts/shot.mjs docs/shots/dir-X-1.png
    WEB_URL=http://localhost:PORT DEBUG_PORT=DPORT node scripts/shot.mjs docs/shots/dir-X-2.png --channel maps
    WEB_URL=http://localhost:PORT DEBUG_PORT=DPORT node scripts/shot.mjs docs/shots/dir-X-settings.png --click 'button[title="Settings"]'

(`--click`, `--hover`, `--press ctrl+k`, `--type` exist; read the script.)
Then Read the png. Look at it as Wes would: is it a default? Is anything
unreadable? Do it again. Budget your loop: at least four looks at the main
chat screen before you call it done, and one each at the sign-in screen,
settings, the DM screen (`--click 'button[title="Direct messages"]'` or
whatever the rail button is; check `ServerRail.tsx`) and a phone width. For
phone width, the shot script takes `--window-size` nowhere; add an env
`WINDOW=390,844` to `scripts/shot.mjs` if you want it (keep the default).
Kill your vite server before you report.

Never run `scripts/dev-restart.sh`, `npm run seed`, `test:smoke`,
`test:dm`, `test:desktop`. They share the database with the others.

## The rules every direction obeys

- Non-negotiable 1: nothing fetched from anywhere. Fonts are system faces or
  files shipped in `web/public/fonts/` and declared with `@font-face`. There
  is no font file in this repo today. If a direction wants a display face,
  the only sources are (a) system faces already on Windows 11 and macOS
  (Segoe UI, Cascadia, Georgia, Cambria, Bahnschrift, Palatino, Book Antiqua
  are on Windows; be honest that Mac users get the fallback), or (b) an OFL
  font you download once from its GitHub release and commit the woff2 for.
  If you commit a font, say which, its license, and where it came from.
  `img-src` and `font-src` in the CSP (`server/src/app.ts` or wherever the
  headers are; grep `Content-Security-Policy`) must allow `'self'` and
  `data:`; check, and change nothing that widens them beyond that.
- Text always wins. 4.5:1 on body text over anything, 3:1 on large text.
  The message column is never fought by art.
- One focal point per screen, one ambient effect per screen. Reduced motion
  has an end state (`prefers-reduced-motion`: the ambient thing stops and
  stays visible, not blank).
- Works at 390px wide: the sidebar and members collapse the way they do
  today (read the existing media queries before replacing them).
- Green stays for connection health only. The word "encrypted" is never
  styled as decoration.
- No decorative emoji, no icon set, no gradient-shimmer headings, no 3D
  tilt, no infinite glow loops. Grain and vignette are fine as the thin
  top layer.
- Every existing class the components use still gets styled. A screen that
  drops to unstyled defaults because the new file forgot `.notices-list` is
  a failed direction. Grep the components for `className=` and check the
  list against your file before your last screenshot.
- `npm run typecheck`, `npm test`, `npm run build` pass.
- Commit with a subject that is a sentence. Put your screenshots in
  `docs/shots/` named `dir-X-*.png` and commit them too.

## A. The room, finished (port 5181, debug 9361)

Branch: `visual-a`. Keep the current tokens' *idea* — cold blue-black room,
one amber light — but rebuild the stylesheet as a **theme system**: every
colour resolves through a named token set, `<html data-theme="…">` switches
it, and a Themes page in Settings (`web/src/components/settings/`, read
how the existing pages are wired) offers at least three: the current
one, a colder one, a warmer candle-lit one, and a light one that is not an
inversion but its own composition (paper, ink, one warm accent). Each theme
has a name and one line of mood text. The choice is saved in `localStorage`
(read how `voice-prefs` persists and mirror it).

Then finish the room. Every surface gets the treatment the research
describes: tinted layered shadows, `--hi` top edge on anything that floats,
tabular numerals on timestamps, `text-wrap: pretty` on messages, ALL-CAPS
letter-spaced labels for group headings, a real focus ring, a hover bar
that reads as a tool not a toolbar. Message density: tighter than Discord,
avatars 36px, 15px body text, 1.45 line height, timestamps in `--mono`.
The composer is the one lifted thing on the screen. The channel header is a
hairline, not a bar.

## B. Hearth's table (port 5182, debug 9362)

Branch: `visual-b`. Scryproof is the tavern the party meets in. Read
`CodeProjects/Hearth/THEMES.md` and one of
`CodeProjects/Hearth/scripts/gen-*-backdrop.mjs` (Wes's own D&D table app).

Build: a deterministic generator `web/scripts/gen-backdrop.mjs` (seeded
PRNG, 2560×1440, under 150 KB) that writes `web/public/backdrops/hall.svg`:
a candle-lit stone hall, upper-middle composition, bottom third dark. Not
the moon scene, that is Hearth's; this is a room with a table and a hearth
in it, painted in flat shapes, gradients and a couple of blur filters, the
way Hearth's scripts do. Commit the script and the SVG. Then a
`.ambient` layer (vignette → gradient into `--bg` → the image,
`background-attachment: fixed`) behind panels at alpha 0.9 so it ghosts
through the gutters between rail, sidebar, main and members. Panels get a
1px inner edge and a soft tinted shadow so they read as things sitting on
the scene. Server names and channel-category headings in a display face
(Palatino Linotype / Book Antiqua / Georgia on the system, or a committed
OFL face such as Cormorant or Alegreya from the Hearth repo if it ships
one; check `CodeProjects/Hearth/src/renderer/assets/fonts`). Gold (a real
`--gold`, metal, not the accent) for ornament only: the server name, the
selected channel's marker, the divider under the date. Message text stays
in a clean sans and stays on a panel that is at least 0.9 opaque.

Dynamic, once: the candles. One ambient effect, a slow 30s flicker on the
hearth glow via a CSS animation on a radial-gradient layer, stopped by
reduced motion at its brightest frame.

## C. Not Discord (port 5183, debug 9363)

Branch: `visual-c`. The three-column layout is the tell of every chat app
built since 2016. Change the structure, not just the colour.

Build: the server rail is gone as a column. The current server's name and
icon head the sidebar, and a click on it opens a server switcher (the
existing `QuickSwitcher` may be the base; read it). Members are a drawer
that slides over from the right on a header button and on a member's
mention, not a permanent column. The message column is centred with a
maximum measure (about 78ch) and breathing room either side; the composer
floats at the bottom of it, lifted, with the channel name inside it as its
label rather than in a header bar. The header becomes a single line: the
channel, its topic, and the buttons, in the top gutter. Voice: when a call
is live, the call is a strip pinned above the composer, not a page.

Type: one face for everything, chosen on purpose and named in a comment.
Bahnschrift is on every Windows 11 machine and is not the default anything;
Segoe UI Variable likewise. Pick one, set the whole scale from it (13/15/
17/22/28), and use weight and letter-spacing for hierarchy instead of size
where you can. Timestamps and stats in `--mono`.

Colour: near-monochrome. One background, one panel, one line, three text
levels, one accent that is not amber and not blue (a green is taken;
consider oxblood, or a pale cream on charcoal). Justify the choice in the
token comment.

Keep the sidebar collapse and members drawer working at 390px. Keep every
feature reachable: read `App.tsx` and the screens to find every button the
rail and header offer today (DMs, settings, notifications, pins, search,
switcher) and give each a home. A feature that disappears is a failed
direction.

## Report

Branch, commit, the list of shots, what you are proudest of in one line,
and what you could not make work in one line. The main session will run
the three side by side for Wes; he picks; the picked one becomes the base.
