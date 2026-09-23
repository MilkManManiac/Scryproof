import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contextMenuItems } from '../src/context-menu-core.js';

const NONE = { isEditable: false, linkURL: '', mediaType: 'none', selectionText: '', editFlags: {} };

test('nothing applicable gives no menu', () => {
  assert.equal(contextMenuItems(NONE), null);
});

test('a plain text box gets cut, copy, paste, select all, gated on editFlags', () => {
  const items = contextMenuItems({
    ...NONE,
    isEditable: true,
    editFlags: { canCut: false, canCopy: true, canPaste: true, canSelectAll: true },
  });
  assert.deepEqual(
    items.map((item) => item.id),
    ['cut', 'copy', 'paste', 'select-all'],
  );
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  assert.equal(byId.cut.enabled, false);
  assert.equal(byId.copy.enabled, true);
  assert.equal(byId.paste.enabled, true);
  assert.equal(byId['select-all'].enabled, true);
});

test('a misspelled word in a text box gets suggestions and add-to-dictionary above the edit items', () => {
  const items = contextMenuItems({
    ...NONE,
    isEditable: true,
    misspelledWord: 'teh',
    dictionarySuggestions: ['the', 'ten', 'tea', 'teh2', 'teh3', 'teh4'],
    editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
  });
  const suggestions = items.filter((item) => item.id === 'spelling-suggestion');
  assert.equal(suggestions.length, 5); // capped
  assert.deepEqual(suggestions.map((item) => item.word), ['the', 'ten', 'tea', 'teh2', 'teh3']);
  const dictionaryIndex = items.findIndex((item) => item.id === 'add-to-dictionary');
  assert.equal(items[dictionaryIndex].word, 'teh');
  assert.equal(items[dictionaryIndex + 1].type, 'separator');
  assert.equal(items[items.length - 4].id, 'cut');
});

test('a correctly spelled word in a text box skips the spelling section entirely', () => {
  const items = contextMenuItems({ ...NONE, isEditable: true, editFlags: { canCopy: true } });
  assert.equal(items.some((item) => item.id === 'spelling-suggestion' || item.id === 'add-to-dictionary'), false);
});

test('selected text outside a box gets a plain Copy', () => {
  const items = contextMenuItems({ ...NONE, selectionText: 'howdy' });
  assert.deepEqual(items, [{ id: 'copy', label: 'Copy', enabled: true }]);
});

test('a link gets copy link and open link, carrying the URL', () => {
  const items = contextMenuItems({ ...NONE, linkURL: 'https://scryproof.com/invite/abc' });
  assert.deepEqual(
    items.map((item) => item.id),
    ['copy-link', 'open-link'],
  );
  assert.equal(items[0].url, 'https://scryproof.com/invite/abc');
  assert.equal(items[1].url, 'https://scryproof.com/invite/abc');
});

test('an image gets copy image and save image', () => {
  const items = contextMenuItems({ ...NONE, mediaType: 'image', srcURL: 'app://scryproof/x.png', x: 12, y: 34 });
  assert.deepEqual(
    items.map((item) => item.id),
    ['copy-image', 'save-image'],
  );
  assert.equal(items[0].x, 12);
  assert.equal(items[0].y, 34);
  assert.equal(items[1].url, 'app://scryproof/x.png');
});

test('a link wins over an image when a click would go both places', () => {
  const items = contextMenuItems({ ...NONE, mediaType: 'image', linkURL: 'https://scryproof.com/', srcURL: 'x.png' });
  assert.deepEqual(
    items.map((item) => item.id),
    ['copy-link', 'open-link'],
  );
});

test('an editable field wins over everything else, even with a link and selection present', () => {
  const items = contextMenuItems({
    ...NONE,
    isEditable: true,
    linkURL: 'https://scryproof.com/',
    selectionText: 'x',
    editFlags: { canCopy: true },
  });
  assert.deepEqual(
    items.map((item) => item.id),
    ['cut', 'copy', 'paste', 'select-all'],
  );
});
