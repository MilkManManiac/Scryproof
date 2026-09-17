/**
 * Application-wide keyboard shortcuts.
 *
 * One rule governs all of them: a key pressed while someone is typing belongs
 * to what they are typing. Anything without a modifier is therefore ignored
 * inside a text box, and the shortcuts that do carry a modifier are the ones
 * chosen not to collide with editing a line of text.
 */

import { useEffect } from 'react';

/** Whether the keystroke landed somewhere a person is composing text. */
export function isTyping(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || !node.tagName) return false;
  if (node.isContentEditable) return true;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT';
}

export interface Shortcuts {
  /** Ctrl/Cmd+K. */
  onSwitcher: () => void;
  /** Ctrl/Cmd+Shift+K, the same door from the other side of a text box. */
  onHelp: () => void;
  /** Alt+Up / Alt+Down: the channel above or below this one in the sidebar. */
  onStepChannel: (step: -1 | 1) => void;
  /** Alt+Shift+Up / Alt+Shift+Down: the server above or below. */
  onStepServer: (step: -1 | 1) => void;
  /** Escape, pressed with nothing else open and nothing being typed. */
  onEscape: () => void;
}

export function useShortcuts(handlers: Shortcuts, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    function onKey(event: KeyboardEvent) {
      const modified = event.ctrlKey || event.metaKey;
      const typing = isTyping(event.target);

      if (modified && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        return handlers.onSwitcher();
      }
      if (modified && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        return handlers.onHelp();
      }

      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        return event.shiftKey ? handlers.onStepServer(step) : handlers.onStepChannel(step);
      }

      // Escape is the only bare key here, and it is the one key a text box
      // already handles for itself before this ever sees it.
      if (event.key === 'Escape' && !typing) {
        return handlers.onEscape();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers, enabled]);
}
