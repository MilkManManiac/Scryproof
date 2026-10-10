/** Activities are standalone browser games, never code in Scryproof's origin. */
export interface Activity {
  id: string;
  name: string;
  description: string;
  path: string;
}

export const ACTIVITIES: readonly Activity[] = [
  {
    id: 'drain-the-swamp',
    name: 'Drain The Swamp',
    description: 'Scoop, sell, upgrade. One swamp at a time.',
    path: '/drain-the-swamp/',
  },
  {
    id: 'hero-line',
    name: 'Hero Line',
    description: 'Maze your lane, send troops at everyone else. Last keep standing.',
    path: '/hero-line/',
  },
  {
    id: 'pass-along',
    name: 'Pass-along',
    description: 'One eight-count, built a layer at a time. Add as many as you like, or save one and pass it on.',
    path: '/pass-along/',
  },
];

const configured =
  import.meta.env.VITE_ACTIVITIES_ORIGIN ?? 'https://activities.scryproof.com';
const origin = new URL(configured);
const local =
  import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(origin.hostname);
if (
  (!local && origin.protocol !== 'https:') ||
  origin.origin === window.location.origin ||
  origin.pathname !== '/' ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash
) {
  throw new Error(
    'Activities must use a separate HTTPS origin (loopback HTTP is allowed in development).',
  );
}
export const ACTIVITY_ORIGIN = origin.origin;
export const activityUrl = (game: Activity): string =>
  new URL(game.path, ACTIVITY_ORIGIN).href;

interface View {
  picker: boolean;
  game: Activity | null;
  minimized: boolean;
}
let view: View = { picker: false, game: null, minimized: false };
const listeners = new Set<() => void>();
function set(patch: Partial<View>): void {
  view = { ...view, ...patch };
  for (const listener of listeners) listener();
}
export const activities = {
  get: () => view,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  open() {
    set(view.game ? { minimized: false } : { picker: true });
  },
  closePicker() {
    set({ picker: false });
  },
  start(game: Activity) {
    set({ game, picker: false, minimized: false });
  },
  minimize() {
    set({ minimized: true });
  },
  end() {
    set({ game: null, minimized: false, picker: false });
  },
};
