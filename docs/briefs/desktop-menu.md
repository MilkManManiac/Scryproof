# Right-click menu in the desktop app

Read `docs/briefs/README.md` first. Sonnet.

Three asks from the group: TheSilentOne (spell check), milky (copy and
paste), milky (right-click images). The desktop app (`desktop/src/main.js`)
has no context menu apart from the tray one, so a misspelled word gets a
red line and no suggestions, and right-click does nothing.

## The job

On the app window's `webContents` `context-menu` event, build a menu from
what was clicked (`params`):

- In a text box: spelling suggestions for the misspelled word (up to 5,
  `params.dictionarySuggestions`), "Add to dictionary"
  (`session.addWordToSpellCheckerDictionary`), then Cut, Copy, Paste,
  Select all, enabled per `params.editFlags`.
- Selected text outside a box: Copy.
- A link: Copy link, and Open link, which goes to the system browser by
  the path `main.js` already uses for outside links (find it; do not add
  a second one).
- An image: Copy image (`webContents.copyImageAt`) and Save image
  (`downloadURL`; the existing download handling applies).
- Nothing applicable: no menu.

Check the spellchecker is on. The page has its own right-click menus
(channel "Delete channel", message menus) that call `preventDefault`;
ours must not pop up on top of those. Find out how Electron 44 reports
that (`context-menu` still fires; look for how to tell) and keep the
page's own menus winning. Say what you found.

The "what goes in the menu" logic is a pure function from a plain params
object to a template, tested in `desktop/test/`
(`node --test desktop/test/*.test.mjs`, which you may run).

## Not in this job

The browser build. Screen share: another brief edits the display-media
handler in `main.js` at the same time; keep to your own function and one
line where it is wired up.
