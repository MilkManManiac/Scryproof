/**
 * What goes in the right-click menu, from what was clicked.
 *
 * A pure function from Electron's `context-menu` event params to a plain
 * template: no Electron here, so `node --test` can run it, and the wiring in
 * `context-menu.js` is the only place that turns a template into a real menu
 * or a click into an action.
 *
 * Electron only fires `context-menu` on `webContents` when the page's own
 * `contextmenu` DOM handler did not call `preventDefault()` (Chromium's
 * behaviour, not something this app opts into). The page's menus (channel
 * "Delete channel", message menus) all call `preventDefault()`, so ours never
 * appears on top of theirs; nothing further is needed to keep them winning.
 *
 * Five items describe a text box: up to five spelling suggestions, then "Add
 * to dictionary" when the clicked word is misspelled, then Cut/Copy/Paste/
 * Select all gated on `editFlags`. Everything else is one of: plain text
 * selected outside a box (Copy), a link (Copy link, Open link), an image
 * (Copy image, Save image), or nothing.
 */

const MAX_SUGGESTIONS = 5;

function textBoxItems(params) {
  const items = [];
  const word = params.misspelledWord;
  if (word) {
    const suggestions = (params.dictionarySuggestions ?? []).slice(0, MAX_SUGGESTIONS);
    for (const suggestion of suggestions) items.push({ id: 'spelling-suggestion', label: suggestion, word: suggestion });
    items.push({ id: 'add-to-dictionary', label: 'Add to dictionary', word });
    items.push({ type: 'separator' });
  }
  const flags = params.editFlags ?? {};
  items.push({ id: 'cut', label: 'Cut', enabled: Boolean(flags.canCut) });
  items.push({ id: 'copy', label: 'Copy', enabled: Boolean(flags.canCopy) });
  items.push({ id: 'paste', label: 'Paste', enabled: Boolean(flags.canPaste) });
  items.push({ id: 'select-all', label: 'Select all', enabled: Boolean(flags.canSelectAll) });
  return items;
}

function linkItems(params) {
  return [
    { id: 'copy-link', label: 'Copy link', url: params.linkURL },
    { id: 'open-link', label: 'Open link', url: params.linkURL },
  ];
}

function imageItems(params) {
  return [
    { id: 'copy-image', label: 'Copy image', x: params.x, y: params.y },
    { id: 'save-image', label: 'Save image', url: params.srcURL },
  ];
}

/**
 * The template for these params, or null when no menu applies. Order matches
 * the brief: a text box, then a link, then an image, then plain selected
 * text, so an image that is also a link (unused today, but possible) gets the
 * link menu rather than the image one.
 */
export function contextMenuItems(params) {
  if (params.isEditable) return textBoxItems(params);
  if (params.linkURL) return linkItems(params);
  if (params.mediaType === 'image') return imageItems(params);
  if (params.selectionText) return [{ id: 'copy', label: 'Copy', enabled: true }];
  return null;
}
