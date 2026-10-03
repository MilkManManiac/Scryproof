/**
 * The page stores a push-to-talk key by its DOM name (`KeyboardEvent.code`,
 * such as `Backquote` or `KeyV`). The system-wide hook speaks in scancodes
 * with names of its own. This is the translation, on its own so it can be
 * tested without Electron or the hook.
 *
 * It also decides when a held key must be let go without waiting for its
 * key-up, because the key-up can be lost: hold the key, Cmd-Tab away, let go,
 * and the hook never hears the release (spike 3, 2026-10-02: the speaking ring
 * stayed lit, a hot mic). The page believes whatever it was last told, so the
 * main process has to say "released" itself.
 *
 * What it does NOT do is release when auto-repeat key-downs stop arriving. That
 * looks like the obvious watchdog and it is wrong: pressing any other key
 * (W to walk while holding push-to-talk, the normal gaming case) stops the held
 * key's auto-repeat on every OS, and a modifier key never repeats on macOS at
 * all, so a repeat-gap watchdog would cut people off mid-sentence. Instead it
 * releases on events that mean "the person left this context", each seen by
 * the hook or the OS while the key is held:
 *
 *   - an app-switch chord: Cmd+Tab and Cmd+` on macOS; Alt+Tab and the Windows
 *     key on Windows;
 *   - on macOS, the Cmd key going down at all. Cmd-Tab is a system hotkey and
 *     the hook may not be shown its Tab; Cmd itself it does see. A hot mic is
 *     a worse failure than a word dropped when someone reaches for Cmd-C while
 *     talking, so any Cmd press while the key is held lets go (unless Cmd is
 *     the push-to-talk key). Plain W, Tab and the like still do not;
 *   - the screen locking, or the machine going to sleep (`release()`, called
 *     from `powerMonitor` in `push-to-talk.js`).
 *
 * After such a release the key counts as up. A late real key-up (if it ever
 * arrives) changes nothing, and a fresh key-down engages again. The chord's own
 * keys never engage: Alt+Tab with Tab as the push-to-talk key is a switch, not
 * a press to talk.
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
 * Whether this key-down is an app-switch chord on `platform`. `keys` is the
 * hook's name table (`UiohookKey`); without it nothing counts as a chord. The
 * modifier is read from the event's own flags, which the hook fills from the
 * OS, so a stuck modifier seen earlier cannot make a plain Tab look like Alt+Tab.
 * `watched` is the push-to-talk key: if that is itself the Windows key, its own
 * press is not a chord.
 */
export function isAppSwitchChord(event, platform, keys, watched) {
  if (!keys || event.type !== 'keydown') return false;
  if (platform === 'darwin') {
    if (event.keycode === keys.Meta || event.keycode === keys.MetaRight) return event.keycode !== watched;
    return event.metaKey === true && (event.keycode === keys.Tab || event.keycode === keys.Backquote);
  }
  if (platform === 'win32') {
    if (event.altKey === true && event.keycode === keys.Tab) return true;
    return event.keycode !== watched && (event.keycode === keys.Meta || event.keycode === keys.MetaRight);
  }
  return false;
}

/**
 * Turns the hook's stream of key events into a single held/not-held for one
 * key. Windows repeats key-down while a key is held; only changes are passed
 * on. Returns the function to feed events to; `.release()` on it lets go of a
 * held key (the screen locked, the machine slept) and reports it once.
 *
 * `options.platform` and `options.keys` switch on app-switch chord detection
 * (see the header); `onChange` hears a chord release like any other.
 */
export function holdTracker(keycode, onChange, options = {}) {
  const { platform = null, keys = null } = options;
  let held = false;
  const release = () => {
    if (!held) return;
    held = false;
    onChange(false);
  };
  const feed = (event) => {
    const chord = isAppSwitchChord(event, platform, keys, keycode);
    if (chord) {
      release();
      return;
    }
    if (event.keycode !== keycode) return;
    const now = event.type === 'keydown';
    if (now === held) return;
    held = now;
    onChange(held);
  };
  feed.release = release;
  return feed;
}
