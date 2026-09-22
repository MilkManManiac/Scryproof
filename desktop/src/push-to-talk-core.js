/**
 * The page stores a push-to-talk key by its DOM name (`KeyboardEvent.code`,
 * such as `Backquote` or `KeyV`). The system-wide hook speaks in scancodes
 * with names of its own. This is the translation, on its own so it can be
 * tested without Electron or the hook.
 */

/** Names that differ between the two, beyond the letter and digit prefixes. */
const ALIASES = {
  ControlLeft: 'Ctrl',
  ControlRight: 'CtrlRight',
  AltLeft: 'Alt',
  AltRight: 'AltRight',
  ShiftLeft: 'Shift',
  ShiftRight: 'ShiftRight',
  MetaLeft: 'Meta',
  MetaRight: 'MetaRight',
};

/** The hook's code for a DOM key name, or null when it has no such key. */
export function keycodeFor(code, keys) {
  if (typeof code !== 'string' || code === '') return null;
  let name = code;
  if (/^Key[A-Z]$/.test(code)) name = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) name = code.slice(5);
  else if (code in ALIASES) name = ALIASES[code];
  if (!Object.prototype.hasOwnProperty.call(keys, name)) return null;
  const found = keys[name];
  return typeof found === 'number' ? found : null;
}

/**
 * Turns the hook's stream of key events into a single held/not-held for one
 * key. Windows repeats key-down while a key is held; only changes are passed
 * on. Returns the function to feed events to.
 */
export function holdTracker(keycode, onChange) {
  let held = false;
  return (event) => {
    if (event.keycode !== keycode) return;
    const now = event.type === 'keydown';
    if (now === held) return;
    held = now;
    onChange(held);
  };
}
