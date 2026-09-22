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
  { id: 'scry', name: 'The chamber' },
  { id: 'hall', name: 'The hall' },
  { id: 'plain', name: 'Plain' },
];

export const DEFAULT_THEME = 'ridge';

export function isThemeId(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((theme) => theme.id === id);
}
