import { useSyncExternalStore } from 'react';

// Unlike chat's drawer breakpoint, a touch device stays compact in landscape.
const query = window.matchMedia('(max-width: 640px), (pointer: coarse)');
function subscribe(listener: () => void) {
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

export function useActivityCompact(): boolean {
  return useSyncExternalStore(subscribe, () => query.matches);
}
