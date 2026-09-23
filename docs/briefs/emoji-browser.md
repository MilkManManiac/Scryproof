# Every emoji, and a picker you can scroll

Read `docs/briefs/README.md` first. Opus. Written 2026-09-23 from Wes's
notes: "For emojis everywhere, can we have a scroll function? Most people
don't want to just type to find one."

## What is there now

`web/src/components/ReactionPicker.tsx`: a search box, recents, and a short
hand-picked set. `web/src/lib/emoji.ts` has `SHORTCODES`, about 400 names;
the picker only shows all of them through search. The picker is used for
reactions (hover menu and the `+` after reactions), the smiley beside Send
in `Composer.tsx`, and the DM composer (`DirectMessages.tsx`). The server's
custom emoji are searched too (batch five).

## The job

A picker like Discord's:

- **Every standard emoji**, grouped in the usual categories (Smileys &
  People, Animals & Nature, Food & Drink, Activities, Travel & Places,
  Objects, Symbols, Flags), in one scrolling grid with a sticky heading per
  category. Recents at the top, then the server's own emoji, then the
  standard ones.
- A row of category buttons along the top or side that jumps the grid to
  that category, and shows which category you are scrolled to.
- The search box stays and stays focused on open; typing filters the whole
  set by name and keywords. Arrow keys and Enter still work if they work
  today.
- Hovering an emoji shows its big version and `:name:` in a footer, as
  Discord does.
- A skin tone choice is welcome if it is simple; skip it if it is not, and
  say so.
- Fast: a few thousand emoji must open instantly. Render categories lazily
  or with `content-visibility`, not all at once, if a plain grid is slow.

**The data.** Generate a static data file once from the Unicode
`emoji-test.txt` (fully-qualified only) plus names that match our existing
shortcodes wherever they overlap, and commit the generator script under
`scripts/` along with its output under `web/src/lib/`. Say which Unicode
version you used. Nothing fetched at runtime; no dependency. Every existing
`:shortcode:` must keep working exactly as before (`emojiToken`, typing
`:fire:`, the list that appears while typing). Keep `pregnant_man`.

Emoji are drawn with the system font, as today. No image sprites, no CDN.

Keep the picker's outside API the same, so the places that use it change
little or not at all. Check each of them opens and places correctly,
including on a phone width (the layout at 640px and below).

## Tests

Unit tests for the data (every old shortcode still resolves; no duplicate
names; each category non-empty) and for search.

## Not in this job

The composer's buttons and their alignment (another brief), reactions'
server side.
