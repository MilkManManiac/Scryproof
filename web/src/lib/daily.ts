/**
 * The state of a daily game in the app: whether it is open, your day as the
 * server last told it, and news of other people finishing. Purdle,
 * Cuntections and the bee each have their own, written before there were
 * six; Queefs, Travhole and Threeway are made from this.
 */

import { api } from './api';

export interface GameDone {
  serverId: string;
  day: number;
  userId: string;
}

export interface Daily<Today> {
  get: () => { open: boolean; today: Today | null };
  subscribe: (listener: () => void) => () => void;
  load: () => Promise<void>;
  apply: (today: Today) => void;
  open: () => void;
  close: () => void;
  done: (event: GameDone) => void;
  onDone: (listener: (done: GameDone) => void) => () => void;
}

function daily<Today extends { nextAt: string }>(fetchToday: () => Promise<Today>): Daily<Today> {
  let view: { open: boolean; today: Today | null } = { open: false, today: null };
  const listeners = new Set<() => void>();
  const doneListeners = new Set<(done: GameDone) => void>();
  let turnover: ReturnType<typeof setTimeout> | null = null;

  const set = (next: Partial<typeof view>) => {
    view = { ...view, ...next };
    for (const listener of listeners) listener();
  };

  const game: Daily<Today> = {
    get: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      try {
        const today = await fetchToday();
        set({ today });
        if (turnover) clearTimeout(turnover);
        const wait = new Date(today.nextAt).getTime() - Date.now() + 2000;
        turnover = setTimeout(() => void game.load(), Math.min(Math.max(wait, 5000), 2 ** 31 - 1));
      } catch {
        // Offline or signed out: the folder just shows nothing for it.
      }
    },
    apply: (today) => set({ today }),
    open() {
      set({ open: true });
      void game.load();
    },
    close: () => set({ open: false }),
    done(event) {
      for (const listener of doneListeners) listener(event);
    },
    onDone(listener) {
      doneListeners.add(listener);
      return () => doneListeners.delete(listener);
    },
  };
  return game;
}

export const queens = daily(() => api.queens.today());
export const travle = daily(() => api.travle.today());
export const thrice = daily(() => api.thrice.today());
