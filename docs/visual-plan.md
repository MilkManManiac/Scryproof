# Visual pass: what is known before starting (2026-09-22)

Wes: "Next I want to work on visual improvements. Look at some of our work in
the Hearth project… also made a design research thing… a zip in my
downloads. Could be a useful skill but don't use if it isn't useful."

Written before the pass so a fresh context does not redo the research or,
worse, tune the current look for six rounds. **Read
`~/.claude/skills/milk-project/references/the-wall.md` before touching
`styles.css`.** Short version: a second visual pass that starts from the
existing CSS produces the existing CSS with more pixels.

## The zip

`Downloads/design-research.zip` is byte-identical to the skill already at
`~/.claude/skills/design-research/` (SKILL.md + four references). Nothing to
install. Its rules were applied here on 2026-09-20 (HANDOFF, "a finish pass
on the whole stylesheet"): tinted layered shadows, `--hi`, one easing, one
warm light, two type tiers, grain, no gimmicks. Fonts were tried
side-by-side and Wes could not see the difference, so system faces stayed.
So the zip is a checklist for the next pass, not a source of new moves.

What the current stylesheet already has (`web/src/styles.css`, 3,500
lines): a blue-black room (`--bg-void` #08090b to `--bg-active` #272d3a),
one amber accent (`--accent` #e0a33f), tinted borders, `--shadow-1/2/3`,
`--hi`, `--ease`, `--t-fast`/`--t-arrive`, `--mono` for machine text,
`body::after` grain at 5%.

## What Hearth adds that Scryproof does not have

Hearth (`CodeProjects/Hearth`, `THEMES.md`, `src/renderer/index.css`,
`scripts/gen-*-backdrop.mjs`) is Wes's D&D table app and the look he has
sat in front of most. What is worth taking:

1. **Themes as eleven tokens.** bg, panel, panel2, border, text, muted,
   accent, accent-dim, gold (ornament), panel-alpha, display font. Every
   colour in the app resolves through them; a theme is one attribute on
   `<html>`. Wes asked for user themes there ("let people build their own
   themes"). Scryproof's tokens are already close to this shape; the work
   is naming them as a theme and adding a picker.
2. **An ambient backdrop behind translucent panels.** `.hearth-ambient`
   layers vignette, a gradient into `bg`, and an image, `background-
   attachment: fixed`, panels at alpha 0.9 so it ghosts through the
   gutters. The image is a **generated SVG** from a deterministic script
   (seeded PRNG, 2560×1440, under ~150 KB, composition upper-middle, bottom
   third dark because panels sit there). No licensing question, crisp at
   any size, "more tentacles" is a one-line change.
3. **"Text always wins."** Backdrops are dimmed three-plus stops; contrast
   floors are not negotiable; the read-aloud (here: message) column is
   never fought by art.
4. **Named themes with a mood line each** (Hearthfire, Darkmoon, Moonveil,
   Barovia…). Attention: Hearth's visual investment is deliberately LOW
   for the table (players should look at each other). Scryproof is a
   thing people stare at for hours, so the investment can be higher, but
   the same rule about the message column holds.

## The plan (decide, build, show; do not ask)

Per the-wall: do not tune. Build **three real directions**, one screen
each (the main chat screen with a voice channel live), screenshot them
side by side, and let Wes pick. Each on its own branch, each built from
the token layer without reading the rest of the current stylesheet's
decisions:

- **A. The room as it is, finished.** Current blue-black and amber, plus a
  theme picker in settings with two or three variants (a colder one, a
  warmer one). Lowest risk, least new.
- **B. Hearth's table.** A generated backdrop (candle-lit hall, or the
  Darkmoon script reused: it is Wes's own work) behind panels at 0.9
  alpha, a display face for server names only, gold for ornament.
  Scryproof as the tavern the party meets in.
- **C. Something that is not Discord.** Discord's three-column layout
  is the AI-tell of chat apps. One idea: the server rail folded into the
  sidebar header, members as a drawer, the message column wider and
  centred with the composer floating. Structure change, not colour change.

Each direction must pass the skill's checklist (no default look, one
focal point, one ambient effect, contrast 4.5:1, works at phone width,
reduced motion has an end state) and Non-negotiable 1 (fonts self-hosted
or system; nothing fetched).

Then: Wes picks, that branch becomes the base, and the remaining screens
follow the picked one. Screenshots of every pass go in `docs/shots/` side
by side so a pass that reads the same as the last one is visible as a
failure.

## Before building

Get Wes's screenshots of what he dislikes now (HANDOFF item 3 has been
waiting on them). `C:\Users\weshu\Pictures\Screenshots\`, newest files.
If there are none, build the three anyway; a picture from him is better
than a question to him.
