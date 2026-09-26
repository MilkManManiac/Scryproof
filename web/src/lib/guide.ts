/**
 * The Guide: how Scryproof works, how notifications work, what every setting
 * does (Wes, 2026-09-26: "some way to tell people how it works and how the
 * notifications work and the settings etc").
 *
 * Opened from the menu behind your name, from Notifications, or by a link
 * anyone can paste into chat: `https://scryproof.com/?guide=phone`. A link
 * like that, clicked inside Scryproof, opens the guide right there instead of
 * a new tab (on an iPhone a new tab would be Safari, not the app).
 */

export const GUIDE_TOPICS = ['basics', 'notifications', 'phone', 'settings'] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

const isTopic = (value: string | null): value is GuideTopic =>
  value !== null && (GUIDE_TOPICS as readonly string[]).includes(value);

/** Pure, for the test: the topic a link points at, if it is a guide link to this very site. */
export function guideTopicOf(href: string, origin: string): GuideTopic | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || !url.searchParams.has('guide')) return null;
    const topic = url.searchParams.get('guide');
    return isTopic(topic) ? topic : 'basics';
  } catch {
    return null;
  }
}

function readFromAddress(): GuideTopic | null {
  try {
    const topic = guideTopicOf(window.location.href, window.location.origin);
    if (!topic) return null;
    const url = new URL(window.location.href);
    url.searchParams.delete('guide');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    return topic;
  } catch {
    return null;
  }
}

let open: GuideTopic | null = typeof window === 'undefined' ? null : readFromAddress();
const listeners = new Set<() => void>();

function tell(): void {
  for (const listener of listeners) listener();
}

export const guide = {
  /** The topic showing, or null when the guide is shut. */
  get: (): GuideTopic | null => open,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  open(topic: GuideTopic = 'basics'): void {
    open = topic;
    tell();
  },
  close(): void {
    open = null;
    tell();
  },
};
