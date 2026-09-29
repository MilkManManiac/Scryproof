/**
 * Cuntections' state in the app, the same shape as Purdle's (`lib/purdle.ts`):
 * whether it is open, your day as the server last told it, and news of other
 * people finishing. The server is the referee (`server/src/routes/cuntections.ts`).
 */

import type { CuntectionsToday } from '@scryproof/shared';

import { api } from './api';

export interface CuntectionsDone {
  serverId: string;
  day: number;
  userId: string;
  mistakes: number;
  solved: boolean;
  streak: number;
}

interface View {
  open: boolean;
  today: CuntectionsToday | null;
}

let view: View = { open: false, today: null };
const listeners = new Set<() => void>();
const doneListeners = new Set<(done: CuntectionsDone) => void>();
let turnover: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<View>): void {
  view = { ...view, ...next };
  for (const listener of listeners) listener();
}

function scheduleTurnover(today: CuntectionsToday): void {
  if (turnover) clearTimeout(turnover);
  const wait = new Date(today.nextAt).getTime() - Date.now() + 2000;
  turnover = setTimeout(() => void cuntections.load(), Math.min(Math.max(wait, 5000), 2 ** 31 - 1));
}

export const cuntections = {
  get: (): View => view,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async load(): Promise<void> {
    try {
      const today = await api.cuntections.today();
      set({ today });
      scheduleTurnover(today);
    } catch {
      // Offline or signed out: the rail just shows no dot.
    }
  },

  apply(today: CuntectionsToday): void {
    set({ today });
  },

  open(): void {
    set({ open: true });
    void cuntections.load();
  },
  close(): void {
    set({ open: false });
  },

  done(event: CuntectionsDone): void {
    for (const listener of doneListeners) listener(event);
  },
  onDone(listener: (done: CuntectionsDone) => void): () => void {
    doneListeners.add(listener);
    return () => doneListeners.delete(listener);
  },
};
