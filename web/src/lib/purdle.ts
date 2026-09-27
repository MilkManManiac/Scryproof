/**
 * Purdle's state in the app: whether the game is open, your day as the
 * server last told it, and news of other people finishing.
 *
 * The server is the referee (`server/src/routes/purdle.ts`); this only holds
 * what it said, so the rail can show a dot until you have played and the
 * board can come back the way you left it.
 */

import type { PurdleToday } from '@scryproof/shared';

import { api } from './api';

export interface PurdleDone {
  serverId: string;
  day: number;
  userId: string;
  tries: number;
  solved: boolean;
  streak: number;
}

interface View {
  open: boolean;
  today: PurdleToday | null;
}

let view: View = { open: false, today: null };
const listeners = new Set<() => void>();
const doneListeners = new Set<(done: PurdleDone) => void>();
let turnover: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<View>): void {
  view = { ...view, ...next };
  for (const listener of listeners) listener();
}

/** A new word at midnight Eastern: fetch it then, whether or not the game is open. */
function scheduleTurnover(today: PurdleToday): void {
  if (turnover) clearTimeout(turnover);
  const wait = new Date(today.nextAt).getTime() - Date.now() + 2000;
  turnover = setTimeout(() => void purdle.load(), Math.min(Math.max(wait, 5000), 2 ** 31 - 1));
}

export const purdle = {
  get: (): View => view,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async load(): Promise<void> {
    try {
      const today = await api.purdle.today();
      set({ today });
      scheduleTurnover(today);
    } catch {
      // Offline or signed out: the rail just shows no dot.
    }
  },

  /** What the server answered a guess with. */
  apply(today: PurdleToday): void {
    set({ today });
  },

  open(): void {
    set({ open: true });
    void purdle.load();
  },
  close(): void {
    set({ open: false });
  },

  /** From the gateway: someone who shares a server finished today's word. */
  done(event: PurdleDone): void {
    for (const listener of doneListeners) listener(event);
  },
  onDone(listener: (done: PurdleDone) => void): () => void {
    doneListeners.add(listener);
    return () => doneListeners.delete(listener);
  },
};
