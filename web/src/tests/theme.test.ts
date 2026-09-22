/**
 * The theme list and what a stored choice resolves to. The CSS itself is
 * checked by eye; this guards the contract around it: ids are unique, every
 * id has a file, moods stay one short line, and junk in storage is harmless.
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chooseTheme } from '../lib/theme';
import { DEFAULT_THEME, THEMES, isThemeId } from '../lib/themes';

const themesDir = fileURLToPath(new URL('../themes/', import.meta.url));
const stylesheet = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8');

/** The custom properties a theme block declares, in order. */
function declared(css: string): string[] {
  return Array.from(css.matchAll(/^\s*(--[\w-]+)\s*:/gm), (match) => match[1] ?? "");
}

describe('themes', () => {
  it('have unique ids and the hall first', () => {
    const ids = THEMES.map((theme) => theme.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(DEFAULT_THEME, 'hall');
  });

  it('keep the mood to one short line', () => {
    for (const theme of THEMES) {
      assert.ok(theme.mood.split(/\s+/).length < 12, `${theme.id}: mood is too long`);
      assert.ok(!theme.mood.includes('\n'), `${theme.id}: mood is more than a line`);
    }
  });

  it('each have a stylesheet that is imported and sets every token the hall sets', () => {
    const hall = declared(readFileSync(`${themesDir}hall.css`, 'utf8'));
    assert.ok(hall.includes('--backdrop') && hall.includes('--panel-alpha') && hall.includes('--glow-color'));
    for (const theme of THEMES) {
      const file = `${themesDir}${theme.id}.css`;
      assert.ok(existsSync(file), `${theme.id}: no themes/${theme.id}.css`);
      assert.ok(stylesheet.includes(`@import './themes/${theme.id}.css'`), `${theme.id}: not imported by styles.css`);
      const css = readFileSync(file, 'utf8');
      assert.ok(css.includes(`:root[data-theme='${theme.id}']`), `${theme.id}: no :root[data-theme] block`);
      const missing = hall.filter((token) => !declared(css).includes(token));
      assert.deepEqual(missing, [], `${theme.id}: does not set ${missing.join(', ')}`);
    }
  });
});

describe('chooseTheme', () => {
  it('keeps a known id', () => {
    assert.equal(chooseTheme('plain'), 'plain');
    assert.ok(isThemeId('hall'));
  });

  it('falls back for anything else', () => {
    assert.equal(chooseTheme(null), DEFAULT_THEME);
    assert.equal(chooseTheme(undefined), DEFAULT_THEME);
    assert.equal(chooseTheme('gone'), DEFAULT_THEME);
    assert.equal(chooseTheme('{"id":"plain"}'), DEFAULT_THEME);
    assert.ok(!isThemeId(42));
  });
});
