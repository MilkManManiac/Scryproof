/*
 * Whether this is a phone-sized window right now. The stylesheet decides
 * what a phone looks like; this is for the few places where the markup
 * itself has to differ, such as a button that opens a drawer that does not
 * exist on a wide screen.
 */

import { useSyncExternalStore } from 'react';

export const PHONE_QUERY = '(max-width: 640px)';

const query = typeof window !== 'undefined' ? window.matchMedia(PHONE_QUERY) : null;

function subscribe(listener: () => void): () => void {
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => query?.matches ?? false);
}
