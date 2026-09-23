/**
 * Turns `context-menu-core.js`'s template into a real menu, and a click into
 * an action. See that file for why this never pops up on top of the page's
 * own menus.
 */

import { clipboard, Menu } from 'electron';

import { contextMenuItems } from './context-menu-core.js';

/**
 * @param {Electron.WebContents} contents
 * @param {(url: string) => void} openOutside opens a web address in the
 *   system browser; the same path `main.js` uses for links out of the page.
 */
export function armContextMenu(contents, openOutside) {
  contents.on('context-menu', (_event, params) => {
    const items = contextMenuItems(params);
    if (!items || items.length === 0) return;

    const template = items.map((item) => {
      if (item.type === 'separator') return { type: 'separator' };
      switch (item.id) {
        case 'spelling-suggestion':
          return { label: item.label, click: () => contents.replaceMisspelling(item.word) };
        case 'add-to-dictionary':
          return { label: item.label, click: () => contents.session.addWordToSpellCheckerDictionary(item.word) };
        case 'cut':
          return { label: item.label, enabled: item.enabled, click: () => contents.cut() };
        case 'copy':
          return { label: item.label, enabled: item.enabled, click: () => contents.copy() };
        case 'paste':
          return { label: item.label, enabled: item.enabled, click: () => contents.paste() };
        case 'select-all':
          return { label: item.label, enabled: item.enabled, click: () => contents.selectAll() };
        case 'copy-link':
          return { label: item.label, click: () => clipboard.writeText(item.url) };
        case 'open-link':
          return { label: item.label, click: () => openOutside(item.url) };
        case 'copy-image':
          return { label: item.label, click: () => contents.copyImageAt(item.x, item.y) };
        case 'save-image':
          return { label: item.label, click: () => contents.downloadURL(item.url) };
        default:
          return { label: item.label, enabled: false };
      }
    });

    Menu.buildFromTemplate(template).popup();
  });
}
