/**
 * The things addressed to you, kept in the order they arrived.
 *
 * Two jobs. One is the pop-up the operating system shows while you are
 * somewhere else. The other is the list behind the bell: what you got, when,
 * and from where, so that after a busy evening "who was that and which server"
 * has an answer. (Wes's idea, 2026-09-21.)
 *
 * Since 2026-10-01 it also keeps one running row per channel for everything
 * else said while you were not looking, so the bell can answer the friend who
 * said "I keep hearing notifications but I don't know where they're coming
 * from": a sound now always leaves a line behind it, and the top of the list
 * says in one sentence what is waiting (Wes: "maybe it does a better job at
 * summarizing").
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
  /**
   * `activity` is the running row for one channel: everything said there
   * since you last read it, one row however many messages. Its id is
   * `activity-` and the channel id.
   */
  kind: 'mention' | 'dm' | 'event' | 'activity';
  /** For an event, whoever planned it. */
  authorId: string;
  /** For an event, its title. */
  authorName: string;
  /**
   * Where it came from. A DM has no server; a group DM carries its name as
   * `channelName`, and a two-person one has neither.
   */
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
  /** Activity only: messages since the row was last read. */
  count?: number;
  /** Activity only: who has been talking, most recent first, each once. */
  authors?: { id: string; name: string }[];
  /** Activity only: the first message not yet seen, which is where a click lands. */
  messageId?: string;
  /** Activity only: the newest message on the row, so reading past it elsewhere clears it. */
  lastId?: string;
}

/** One message arriving in a channel, for its running row. */
export interface Arrival {
  messageId: string;
  at: number;
  authorId: string;
  authorName: string;
  serverId: string | null;
  serverName: string | null;
  channelId: string;
  channelName: string | null;
  preview: string | null;
}

export interface NoticePrefs {
  /** While the app is in the background, pop-ups go to the computer's own notifications. */
  popups: boolean;
  /** Whether the list behind the bell may quote a channel message. Pop-ups have their own setting. */
  previews: boolean;
}

const KEEP = 200;
/** Names kept on a running row. "lamp, Forg and 9 others" needs the nine counted, not named. */
const AUTHORS_KEPT = 20;
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

/** Unread notices that were for you in particular: everything but the running channel rows. */
export function forYou(list: readonly Notice[]): number {
  return list.reduce((count, entry) => count + (entry.read || entry.kind === 'activity' ? 0 : 1), 0);
}

export const activityId = (channelId: string): string => `activity-${channelId}`;

/**
 * A message onto its channel's running row. An unread row grows; a read one
 * (or none) starts again from this message, which becomes where a click lands.
 * The row moves to the top either way, since that is where the news is.
 */
export function withActivity(list: readonly Notice[], arrival: Arrival): Notice[] {
  const id = activityId(arrival.channelId);
  const existing = list.find((entry) => entry.id === id);
  const growing = existing && !existing.read ? existing : null;
  const authors = [
    { id: arrival.authorId, name: arrival.authorName },
    ...(growing?.authors ?? []).filter((who) => who.id !== arrival.authorId),
  ].slice(0, AUTHORS_KEPT);
  const row: Notice = {
    id,
    at: arrival.at,
    kind: 'activity',
    authorId: arrival.authorId,
    authorName: arrival.authorName,
    serverId: arrival.serverId,
    serverName: arrival.serverName,
    channelId: arrival.channelId,
    channelName: arrival.channelName,
    dmId: null,
    preview: arrival.preview,
    read: false,
    count: (growing?.count ?? 0) + 1,
    authors,
    messageId: growing?.messageId ?? arrival.messageId,
    lastId: arrival.messageId,
  };
  return [row, ...list.filter((entry) => entry.id !== id)].slice(0, KEEP);
}

/** One place with something waiting in it: a channel, a conversation, an event. */
export interface Place {
  key: string;
  kind: 'channel' | 'dm' | 'event';
  serverId: string | null;
  /** The server's name, or "Direct messages". */
  label: string;
  /** "#general", a group's name, a person's name, or an event's title. */
  where: string;
  /** Messages waiting. An event counts as one. */
  count: number;
  /** Who, most recent first. */
  names: string[];
  /** Unread mentions here, newest first. */
  mentions: Notice[];
  /** The last thing said, where previews are on. Never for a direct message. */
  preview: string | null;
  latest: number;
  /** The notice to open: it lands on the first thing not yet seen. */
  open: Notice;
}

export interface Summary {
  dms: number;
  mentions: number;
  /** Channel messages, mentions included. */
  messages: number;
  /** Channels those messages are in. */
  channels: number;
  events: number;
  places: Place[];
}

/** What is waiting, by place, most recent news first. Only unread notices count. */
export function summarize(list: readonly Notice[]): Summary {
  const places = new Map<string, Place>();
  // Oldest first, so the first notice met for a place is the one to open.
  const unread = list.filter((entry) => !entry.read).reverse();
  const counted = new Set(unread.filter((entry) => entry.kind === 'activity').map((entry) => entry.channelId));
  let dms = 0;
  let mentions = 0;

  for (const entry of unread) {
    if (entry.kind === 'event') {
      places.set(entry.id, {
        key: entry.id,
        kind: 'event',
        serverId: entry.serverId,
        label: entry.serverName ?? 'A server',
        where: entry.authorName,
        count: 1,
        names: [],
        mentions: [],
        preview: entry.preview,
        latest: entry.at,
        open: entry,
      });
      continue;
    }

    const isDm = entry.kind === 'dm';
    const key = isDm ? `dm-${entry.dmId ?? entry.authorId}` : `channel-${entry.channelId ?? entry.id}`;
    const place: Place = places.get(key) ?? {
      key,
      kind: isDm ? 'dm' : 'channel',
      serverId: isDm ? null : entry.serverId,
      label: isDm ? 'Direct messages' : (entry.serverName ?? 'A server'),
      where: isDm ? (entry.channelName ?? entry.authorName) : `#${entry.channelName ?? 'channel'}`,
      count: 0,
      names: [],
      mentions: [],
      preview: null,
      latest: entry.at,
      open: entry,
    };
    place.latest = Math.max(place.latest, entry.at);
    places.set(key, place);

    if (entry.kind === 'activity') {
      place.count += entry.count ?? 1;
      place.names = (entry.authors ?? []).map((who) => who.name);
      place.preview = entry.preview;
      // The running row knows the first message not yet seen; land there.
      place.open = entry;
      continue;
    }

    if (isDm) dms += 1;
    else {
      mentions += 1;
      place.mentions = [entry, ...place.mentions];
    }
    // A DM is its own count. A mention is already in its channel's running
    // row, unless it arrived before running rows existed.
    if (isDm || !counted.has(entry.channelId)) {
      place.count += 1;
      place.names = [entry.authorName, ...place.names.filter((name) => name !== entry.authorName)];
    }
  }

  const sorted = Array.from(places.values()).sort((a, b) => b.latest - a.latest);
  const channels = sorted.filter((place) => place.kind === 'channel');
  return {
    dms,
    mentions,
    messages: channels.reduce((total, place) => total + place.count, 0),
    channels: channels.length,
    events: sorted.filter((place) => place.kind === 'event').length,
    places: sorted,
  };
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** The sentence at the top of the bell. */
export function digestLine(summary: Summary): string {
  const parts: string[] = [];
  if (summary.dms > 0) parts.push(plural(summary.dms, 'direct message', 'direct messages'));
  if (summary.mentions > 0) parts.push(plural(summary.mentions, 'mention', 'mentions'));
  if (summary.messages > 0) {
    parts.push(`${plural(summary.messages, 'message', 'messages')} in ${plural(summary.channels, 'channel', 'channels')}`);
  }
  if (summary.events > 0) parts.push(plural(summary.events, 'event coming up', 'events coming up'));
  if (parts.length === 0) return 'Nothing new. You are caught up.';
  const last = parts.pop()!;
  return `Waiting for you: ${parts.length > 0 ? `${parts.join(', ')} and ${last}` : last}.`;
}

/** "lamp", "lamp and Forg", "lamp, Forg and 3 others". */
export function namesLine(names: readonly string[]): string {
  if (names.length === 0) return 'Someone';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${plural(names.length - 2, 'other', 'others')}`;
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

export const notices = {
  /** The list belongs to whoever is signed in. Somebody else on this browser gets their own. */
  use(userId: string | null): void {
    if (userId === owner) return;
    owner = userId;
    list = userId ? readJson<Notice[]>(listKey(userId), []) : [];
    for (const listener of listeners) listener();
  },
  get: (): readonly Notice[] => list,
  /** For the number on the bell: what was for you. Channel chatter lights the bell without a number. */
  unread: (): number => forYou(list),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Onto the list. Whether it also pops up is `lib/popups.ts`'s business. */
  arrived(notice: Notice): void {
    if (list.some((entry) => entry.id === notice.id)) return;
    // An event's preview is its start time, not anything somebody wrote.
    const kept = prefs.previews || notice.kind === 'event' ? notice : { ...notice, preview: null };
    list = withNotice(list, kept);
    changed();
  },
  /** Something said in a channel while you were not looking at it. Quiet: the list only. */
  activity(arrival: Arrival): void {
    list = withActivity(list, prefs.previews ? arrival : { ...arrival, preview: null });
    changed();
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
  /**
   * Read up to a message on another device. Rows about things at or before
   * that message are read; anything newer is still news here.
   */
  readThrough(channelId: string, lastReadMessageId: string): void {
    let touched = false;
    list = list.map((entry) => {
      if (entry.read || entry.channelId !== channelId) return entry;
      const newest =
        entry.kind === 'activity' ? (entry.lastId ?? entry.messageId ?? '') : entry.kind === 'mention' ? entry.id : null;
      if (newest === null || newest > lastReadMessageId) return entry;
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
  /** Go where a notice points without marking anything read: a pop-up about a voice room or a game. */
  goTo(notice: Notice): void {
    opener?.(notice);
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
