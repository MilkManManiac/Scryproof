/**
 * One-shot signals between components that do not own each other.
 *
 * There is exactly one so far: pressing Up in an empty composer opens the last
 * thing you said for editing. The composer owns the keystroke and the message
 * list owns the editor, and neither is the other's parent, so the alternative
 * was threading a callback through the shell for a single key.
 *
 * Deliberately not in the store. The store is what the server said; this is a
 * keystroke that has already happened and leaves nothing behind.
 */

type Handler = () => void;

const handlers = new Map<string, Set<Handler>>();

export function emit(signal: string): void {
  for (const handler of handlers.get(signal) ?? []) handler();
}

/** Returns the unsubscribe, so it can be given straight back from an effect. */
export function on(signal: string, handler: Handler): () => void {
  const set = handlers.get(signal) ?? new Set<Handler>();
  set.add(handler);
  handlers.set(signal, set);
  return () => {
    set.delete(handler);
    if (set.size === 0) handlers.delete(signal);
  };
}

/** Up, in an empty composer: open the last message this person sent. */
export const EDIT_LAST = 'edit-last';

/** On a phone: slide the servers and channels in. A header asks; the shell answers. */
export const OPEN_DOCK = 'open-dock';
