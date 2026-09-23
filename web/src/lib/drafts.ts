/**
 * Text typed but not sent yet, kept per channel or per direct-message
 * conversation so switching away and back puts it right back in the box.
 *
 * In memory only, for as long as the tab stays open. No localStorage, no
 * IndexedDB: a DM draft written to disk would be the plaintext of an
 * encrypted conversation sitting unencrypted on the machine, and the ask
 * was "until you close the app", not "forever". A refresh loses every
 * draft on purpose.
 */

export interface DraftStore {
  /** The unsent text for this id, or '' if there is none. */
  get(id: string): string;
  /** Replace the unsent text for this id. An empty string is the same as clearing it. */
  set(id: string, text: string): void;
  /** Forget this id's draft, e.g. once its message has sent. */
  clear(id: string): void;
  /** For `useSyncExternalStore`: fires after any set or clear. */
  subscribe(listener: () => void): () => void;
  /** For `useSyncExternalStore`'s snapshot: changes on every set or clear. */
  getVersion(): number;
}

function createDraftStore(): DraftStore {
  const drafts = new Map<string, string>();
  const listeners = new Set<() => void>();
  let version = 0;

  function notify(): void {
    version += 1;
    for (const listener of listeners) listener();
  }

  return {
    get: (id) => drafts.get(id) ?? '',
    set(id, text) {
      if (text) drafts.set(id, text);
      else drafts.delete(id);
      notify();
    },
    clear(id) {
      if (!drafts.has(id)) return;
      drafts.delete(id);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}

/** One channel's unsent text, keyed by channel id. */
export const channelDrafts = createDraftStore();

/** One direct-message conversation's unsent text, keyed by conversation id. */
export const dmDrafts = createDraftStore();

// A pencil mark in the sidebar is only worth showing for a line or two left
// mid-thought; a long draft would make the channel list look like it is
// shouting, so it is left off past this size.
const SHORT_DRAFT_LINES = 3;
const SHORT_DRAFT_CHARS = 140;

/** Whether a draft is short enough to earn the sidebar's pencil mark. */
export function isShortDraft(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return trimmed.length <= SHORT_DRAFT_CHARS && trimmed.split('\n').length <= SHORT_DRAFT_LINES;
}
