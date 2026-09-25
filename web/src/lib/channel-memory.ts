/**
 * What this device remembers about which channels it has seen encrypted.
 *
 * The rules, all of them one-way:
 *  - once a channel has been seen encrypted here, it stays encrypted here;
 *    the honest server never turns encryption off, so a channel that comes
 *    back saying `encrypted: false` was taken over by something that lies;
 *  - the moment encryption started (`since`) only ever moves earlier, and
 *    "from the beginning" (null, a channel made encrypted) is the earliest
 *    of all;
 *  - the highest epoch this device has sent under only ever moves up, so a
 *    server cannot put the channel back on a key somebody removed still has.
 *
 * The view is in memory so a render can read it without waiting; the same
 * values are kept in IndexedDB so they survive a restart. One of these is made
 * per sign-in (`channelMemory()` in `channel-keys.ts`), and `docs/channel-e2ee.md`
 * says why the server is not believed about any of it.
 */

/** One channel's entry: when it turned encrypted, and how far its keys have moved. */
export interface Remembered {
  /**
   * The channel's `encryptedAt`. Null means the channel was made encrypted, so
   * every message in it is sealed: the earliest possible moment.
   */
  since: string | null;
  /** The newest epoch this device has sent under here. */
  highestEpoch: number;
}

/** Where the memory is kept between visits: one small record per channel. */
export interface ChannelMemoryStore {
  /** Everything held, by channel id. Read once, at sign-in. */
  all(): Promise<Record<string, Remembered>>;
  /** Write one channel back, keeping whichever of the two is more careful. */
  remember(channelId: string, entry: Remembered): Promise<void>;
}

/** The earlier of two moments. Null ("from the beginning") is earlier than every time. */
export function earlierSince(left: string | null, right: string | null): string | null {
  if (left === null || right === null) return null;
  const a = Date.parse(left);
  const b = Date.parse(right);
  // A moment that cannot be read gives way to one that can. `remember` never
  // stores one (see `claimedSince`), so this only tidies up after the fact.
  if (Number.isNaN(a)) return Number.isNaN(b) ? null : right;
  if (Number.isNaN(b)) return left;
  return a <= b ? left : right;
}

/**
 * What this device takes as the moment a channel turned encrypted: the
 * server's claim, but never later than now, because a channel seen encrypted
 * now was encrypted by now. A claim from the future would otherwise pass every
 * made-up plaintext message as history from before the switch. Anything that
 * is not a readable time, including a missing one, counts as "from the
 * beginning": that hides history rather than showing something made up.
 */
export function claimedSince(encryptedAt: unknown, now: number = Date.now()): string | null {
  if (typeof encryptedAt !== 'string') return null;
  const at = Date.parse(encryptedAt);
  if (Number.isNaN(at)) return null;
  return at > now ? new Date(now).toISOString() : encryptedAt;
}

/** The rules above, as one function: earlier start, higher epoch, nothing else. */
export function mergeRemembered(held: Remembered | undefined, entry: Remembered): Remembered {
  if (!held) return entry;
  return {
    since: earlierSince(held.since, entry.since),
    highestEpoch: Math.max(held.highestEpoch, entry.highestEpoch),
  };
}

export class ChannelMemory {
  private readonly view = new Map<string, Remembered>();
  /** Channels the server has told this device are no longer encrypted. */
  private readonly denied = new Set<string>();
  private loading: Promise<void> | null = null;
  private loaded = false;

  constructor(private readonly store: ChannelMemoryStore) {}

  /**
   * Read the whole memory once. Everything that sends waits for this, and the
   * store waits for it before drawing a channel, so the first read is the only
   * one that can be slow.
   */
  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.loading) {
      this.loading = this.store
        .all()
        .then((held) => {
          for (const [channelId, entry] of Object.entries(held)) this.view.set(channelId, mergeRemembered(this.view.get(channelId), entry));
          this.loaded = true;
        })
        .catch((problem: unknown) => {
          // Nothing is remembered for now; the next call tries again rather
          // than remembering a failure for the life of the tab.
          this.loading = null;
          throw problem;
        });
    }
    return this.loading;
  }

  /** Let go of the view: sign-out. The database keeps what it holds. */
  forget(): void {
    this.view.clear();
    this.denied.clear();
    this.loaded = false;
    this.loading = null;
  }

  /** When this channel turned encrypted, or undefined if this device never saw it encrypted. */
  since(channelId: string): string | null | undefined {
    const entry = this.view.get(channelId);
    return entry ? entry.since : undefined;
  }

  isEncrypted(channelId: string): boolean {
    return this.view.has(channelId);
  }

  /**
   * Whether this device must refuse to put anything up readable in a channel.
   * Waits for the stored memory so "not encrypted" is never just "not read
   * yet". If the database cannot be read at all, the answer falls back to what
   * this tab has seen: every channel the server sends is remembered as it
   * arrives, so the only thing lost is what an earlier session saw, which a
   * device without working storage never kept anyway.
   */
  async refusesPlaintext(channelId: string): Promise<boolean> {
    await this.load().catch(() => undefined);
    return this.isEncrypted(channelId);
  }

  highestEpoch(channelId: string): number {
    return this.view.get(channelId)?.highestEpoch ?? 0;
  }

  /**
   * A channel the server says is encrypted. Called wherever a channel enters
   * the store, so anything a person can open is remembered before they can
   * send in it.
   */
  remember(channel: { id: string; encryptedAt: string | null }): Promise<void> {
    const held = this.view.get(channel.id);
    const next = mergeRemembered(held, { since: claimedSince(channel.encryptedAt), highestEpoch: 0 });
    if (held && held.since === next.since) return Promise.resolve();
    this.view.set(channel.id, next);
    return this.store.remember(channel.id, next).catch(() => undefined);
  }

  /**
   * This device has sent under `epoch`. Called by `sendKey` the moment an
   * epoch comes back, including one it just made.
   */
  raise(channelId: string, epoch: number): Promise<void> {
    const held = this.view.get(channelId);
    // A channel this device has not recorded yet is known to be encrypted from
    // now, not from the beginning: null would mark every plaintext message in
    // its history as forged, and "earliest wins" would keep it that way. The
    // real start replaces this when the channel itself is remembered.
    const since = held ? held.since : new Date().toISOString();
    const next = mergeRemembered(held, { since, highestEpoch: epoch });
    if (held && held.highestEpoch === next.highestEpoch) return Promise.resolve();
    this.view.set(channelId, next);
    return this.store.remember(channelId, next).catch(() => undefined);
  }

  /** The server says a channel this device has seen encrypted is not encrypted any more. */
  noteDowngrade(channelId: string): void {
    this.denied.add(channelId);
  }

  downgraded(channelId: string): boolean {
    return this.denied.has(channelId);
  }
}
