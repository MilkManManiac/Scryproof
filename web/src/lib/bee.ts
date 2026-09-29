/**
 * The bee's state in the app, the same shape as Purdle's (`lib/purdle.ts`):
 * whether it is open, your day as the server last told it, and news of other
 * people's points. The server is the referee (`server/src/routes/bee.ts`).
 */

import type { BeeToday } from '@scryproof/shared';

import { api } from './api';

export interface BeeMoved {
  serverId: string;
  day: number;
  userId: string;
  score: number;
  words: number;
  rank: number;
}

interface View {
  open: boolean;
  today: BeeToday | null;
}

let view: View = { open: false, today: null };
const listeners = new Set<() => void>();
const movedListeners = new Set<(moved: BeeMoved) => void>();
let turnover: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<View>): void {
  view = { ...view, ...next };
  for (const listener of listeners) listener();
}

function scheduleTurnover(today: BeeToday): void {
  if (turnover) clearTimeout(turnover);
  const wait = new Date(today.nextAt).getTime() - Date.now() + 2000;
  turnover = setTimeout(() => void bee.load(), Math.min(Math.max(wait, 5000), 2 ** 31 - 1));
}

export const bee = {
  get: (): View => view,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async load(): Promise<void> {
    try {
      const today = await api.bee.today();
      set({ today });
      scheduleTurnover(today);
    } catch {
      // Offline or signed out: the rail just shows no dot.
    }
  },

  apply(today: BeeToday): void {
    set({ today });
  },

  open(): void {
    set({ open: true });
    void bee.load();
  },
  close(): void {
    set({ open: false });
  },

  moved(event: BeeMoved): void {
    for (const listener of movedListeners) listener(event);
  },
  onMoved(listener: (moved: BeeMoved) => void): () => void {
    movedListeners.add(listener);
    return () => movedListeners.delete(listener);
  },
};
