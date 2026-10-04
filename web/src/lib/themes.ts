/**
 * The themes on offer. Each one is a file in `web/src/themes/<id>.css` (see
 * `hall.css` for the tokens a theme must set; `scry.css` is the default and
 * also paints bare `:root`) and, if it has a painting, a JPG in
 * `web/public/backdrops/` (the originals are in `assets/gen/`, made through
 * the imagegen tool on 2026-09-22). Adding a theme is one CSS file, one
 * `@import` at the top of `styles.css`, and one entry here.
 */

export interface Theme {
  id: string;
  name: string;
  /** One line, under twelve words: what the room feels like. */
}

export const THEMES: readonly Theme[] = [
  { id: 'ridge', name: 'The ridge' },
  { id: 'ember', name: 'The ridge, alive' },
  { id: 'trey', name: 'Trey' },
  { id: 'dusk', name: 'Ham' },
  { id: 'forg', name: 'Forg' },
  { id: 'loaf2', name: 'Loaf v2' },
  { id: 'loaf', name: 'Loaf' },
  { id: 'scry', name: 'The chamber' },
  { id: 'hall', name: 'The hall' },
  { id: 'plain', name: 'Plain' },
];

/*
 * Built and held: Lady of the Lake (`themes/lake.css`, `lake-scene.ts`), Wes
 * 2026-09-26: "Hold off on that theme. Its fine just don't want to push now."
 * To release it, add { id: 'lake', name: 'Lady of the Lake' } after 'ember',
 * and put its What's new entry back (the text is in docs/HANDOFF.md).
 */

export const DEFAULT_THEME = 'ridge';

export function isThemeId(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((theme) => theme.id === id);
}
