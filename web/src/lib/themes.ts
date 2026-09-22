/**
 * The themes on offer. Each one is a file in `web/src/themes/<id>.css` (see
 * `hall.css` for the tokens a theme must set) and, if it has a painting, a
 * generated `web/public/backdrops/<id>.svg`. Adding a theme is one CSS file,
 * one `@import` at the top of `styles.css`, and one entry here.
 */

export interface Theme {
  id: string;
  name: string;
  /** One line, under twelve words: what the room feels like. */
  mood: string;
}

export const THEMES: readonly Theme[] = [
  { id: 'hall', name: 'The hall', mood: 'A candle-lit hall, the hearth breathing behind the table.' },
  { id: 'plain', name: 'Plain', mood: 'The same warm room without the painting.' },
];

export const DEFAULT_THEME = THEMES[0].id;

export function isThemeId(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((theme) => theme.id === id);
}
