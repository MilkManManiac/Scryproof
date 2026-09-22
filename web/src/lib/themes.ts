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
  mood: string;
}

export const THEMES: readonly Theme[] = [
  { id: 'scry', name: 'The chamber', mood: 'A dark stone room, lit from the water.' },
  { id: 'hall', name: 'The hall', mood: 'A candle-lit hall, the hearth breathing behind the table.' },
  { id: 'ridge', name: 'The ridge', mood: 'A campfire high up, under a cold sky.' },
  { id: 'plain', name: 'Plain', mood: 'The same warm room without the painting.' },
];

export const DEFAULT_THEME = 'scry';

export function isThemeId(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((theme) => theme.id === id);
}
