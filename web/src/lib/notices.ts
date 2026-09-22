/**
 * The things addressed to you, kept in the order they arrived.
 *
 * Two jobs. One is the pop-up the operating system shows while you are
 * somewhere else. The other is the list behind the bell: what you got, when,
 * and from where, so that after a busy evening "who was that and which server"
 * has an answer. (Wes's idea, 2026-09-21.)
 *
 * All of it stays on this machine. The list lives in this browser's storage
 * and the server is never told what was shown or what was read from it.
 *
 * A direct message is recorded as having arrived, and from whom. Never what it
 * said: the text is end-to-end encrypted, and neither this list (which sits in
 * plain storage) nor the operating system's notification history is a place
 * that promise should leak into.
 */

export interface Notice {
  /**
   * The message id, so the same message is never listed twice. For an event
   * reminder, `event-` and the event id: each event is reminded about once.
   */
  id: string;
  at: number;
  kind: 'mention' | 'dm' | 'event';
  /** For an event, whoever planned it. */
  authorId: string;
  /** For an event, its title. */
  authorName: string;
  /** Where it came from. A DM has neither. */
  serverId: string | null;
  serverName: string | null;
  channelId: string | null;
  channelName: string | null;
  dmId: string | null;
  /**
   * What it said, for channel messages only, and only if that is switched on.
   * For an event, when it starts, which is always kept: it is the reminder.
   */
  preview: string | null;
  read: boolean;
}

export interface NoticePrefs {
  /** Ask the operating system to show a pop-up. */
  popups: boolean;
  /** Whether a pop-up and the list may quote a channel message. */
  previews: boolean;
}

const KEEP = 200;
const PREVIEW_LENGTH = 140;
const PREFS_KEY = 'scryproof.notices.prefs.v1';
const DEFAULT_PREFS: NoticePrefs = { popups: false, previews: true };

/* -------------------------------- the rules -------------------------------- */

export interface NoticeContext {
  authorId: string;
  selfId: string | null;
  /** True for a DM, and for a channel message that pings this person. */
  addressedToMe: boolean;
  /** The conversation is on screen in a window somebody is sitting at. */
  watching: boolean;
  windowFocused: boolean;
  /**
   * The server or the channel this arrived in has been muted. It still goes
   * on the list behind the bell — muting silences, it does not hide — but it
   * never pops up.
   */
  muted: boolean;
  /**
   * The author is somebody this person has blocked. Unlike muting, this does
   * hide: a blocked person cannot put anything on the list or on the screen.
   */
  blocked: boolean;
}

/**
 * Whether an arrival goes on the list, and whether it also pops up.
 *
 * Something you watched arrive is not news. Something that arrived in another
 * channel while you were here goes on the list quietly. A pop-up is only for
 * when the window is not the one you are in, and never for a muted place.
 */
export function noticeFor(input: NoticeContext): { list: boolean; popup: boolean } {
  if (!input.selfId || input.authorId === input.selfId || !input.addressedToMe || input.watching) {
    return { list: false, popup: false };
  }
  if (input.blocked) return { list: false, popup: false };
  return { list: true, popup: !input.windowFocused && !input.muted };
}

/**
 * An event reminder is treated like a mention: it always goes on the list,
 * since the person asked for it by saying they were coming, and it pops up
 * when the window is elsewhere and the server (or the event's channel) is
 * not muted.
 */
export function eventNoticeFor(input: { windowFocused: boolean; muted: boolean }): { list: boolean; popup: boolean } {
  return { list: true, popup: !input.windowFocused && !input.muted };
}

export function previewOf(text: string | null): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

/** Newest first, no message twice, and never more than the list is allowed to hold. */
export function withNotice(list: readonly Notice[], notice: Notice): Notice[] {
  if (list.some((entry) => entry.id === notice.id)) return list.slice();
  return [notice, ...list].slice(0, KEEP);
}

/** How many came from each place, for the row of filters across the top. */
export function bySource(list: readonly Notice[]): { key: string; label: string; total: number; unread: number }[] {
  const sources = new Map<string, { key: string; label: string; total: number; unread: number }>();
  for (const entry of list) {
    const key = entry.serverId ?? 'dm';
    const found = sources.get(key) ?? { key, label: entry.serverName ?? 'Direct messages', total: 0, unread: 0 };
    found.total += 1;
    if (!entry.read) found.unread += 1;
    sources.set(key, found);
  }
  return Array.from(sources.values()).sort((a, b) => b.total - a.total);
}

/* -------------------------------- the store -------------------------------- */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows can refuse storage. The list still holds for this tab.
  }
}

let owner: string | null = null;
let list: Notice[] = [];
let prefs: NoticePrefs = { ...DEFAULT_PREFS, ...readJson<Partial<NoticePrefs>>(PREFS_KEY, {}) };
const listeners = new Set<() => void>();
/** Set by the app: how to go to the thing a notice is about. */
let opener: ((notice: Notice) => void) | null = null;

const listKey = (userId: string): string => `scryproof.notices.v1.${userId}`;
const changed = (): void => {
  if (owner) writeJson(listKey(owner), list);
  for (const listener of listeners) listener();
};

function popup(notice: Notice): void {
  if (!prefs.popups || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const where =
    notice.kind === 'mention' ? `${notice.authorName} in #${notice.channelName}` : notice.authorName;
  const body =
    notice.kind === 'dm'
      ? 'Sent you a message.'
      : [notice.preview, notice.serverName].filter(Boolean).join('\n') ||
        (notice.kind === 'event' ? 'Starts within the hour.' : 'Mentioned you.');
  try {
    // The tag lets a second message from the same place replace the first
    // rather than stack up beside it.
    const shown = new Notification(where, { body, tag: notice.dmId ?? notice.channelId ?? notice.id, silent: true });
    shown.onclick = () => {
      window.focus();
      notices.open(notice);
      shown.close();
    };
  } catch {
    // Some browsers only allow these from a service worker. The list has it anyway.
  }
}

export const notices = {
  /** The list belongs to whoever is signed in. Somebody else on this browser gets their own. */
  use(userId: string | null): void {
    if (userId === owner) return;
    owner = userId;
    list = userId ? readJson<Notice[]>(listKey(userId), []) : [];
    for (const listener of listeners) listener();
  },
  get: (): readonly Notice[] => list,
  unread: (): number => list.reduce((count, entry) => count + (entry.read ? 0 : 1), 0),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  arrived(notice: Notice, show: boolean): void {
    if (list.some((entry) => entry.id === notice.id)) return;
    // An event's preview is its start time, not anything somebody wrote.
    const kept = prefs.previews || notice.kind === 'event' ? notice : { ...notice, preview: null };
    list = withNotice(list, kept);
    changed();
    if (show) popup(kept);
  },
  /** Reading the conversation is reading its notices, however you got there. */
  readWhere(match: { channelId?: string; dmId?: string }): void {
    let touched = false;
    list = list.map((entry) => {
      const hit = (match.channelId && entry.channelId === match.channelId) || (match.dmId && entry.dmId === match.dmId);
      if (!hit || entry.read) return entry;
      touched = true;
      return { ...entry, read: true };
    });
    if (touched) changed();
  },
  /** An event reminder is not read by reading a channel, so it is marked on its own. */
  readOne(id: string): void {
    if (!list.some((entry) => entry.id === id && !entry.read)) return;
    list = list.map((entry) => (entry.id === id ? { ...entry, read: true } : entry));
    changed();
  },
  readAll(): void {
    if (!list.some((entry) => !entry.read)) return;
    list = list.map((entry) => (entry.read ? entry : { ...entry, read: true }));
    changed();
  },
  clear(): void {
    list = [];
    changed();
  },

  onOpen(handler: ((notice: Notice) => void) | null): void {
    opener = handler;
  },
  open(notice: Notice): void {
    if (notice.kind === 'event') notices.readOne(notice.id);
    else notices.readWhere(notice.dmId ? { dmId: notice.dmId } : { channelId: notice.channelId ?? undefined });
    opener?.(notice);
  },

  prefs: (): NoticePrefs => prefs,
  setPrefs(patch: Partial<NoticePrefs>): void {
    prefs = { ...prefs, ...patch };
    writeJson(PREFS_KEY, prefs);
    for (const listener of listeners) listener();
  },
  /** Must be called from a click: browsers only ask the person when they did something. */
  async enablePopups(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    const answer = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    notices.setPrefs({ popups: answer === 'granted' });
    return answer === 'granted';
  },
};
