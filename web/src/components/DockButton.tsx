/*
 * On a phone, the button at the left of a header that slides the servers
 * and channels in. On a wide screen they are already there, so it is not.
 * The shell owns the drawer; this only asks for it.
 */

import { OPEN_DOCK, emit } from '../lib/signals';
import { usePhone } from '../lib/usePhone';

export function DockButton() {
  const phone = usePhone();
  if (!phone) return null;
  return (
    <button type="button" className="icon-button dock-open" title="Servers and channels" onClick={() => emit(OPEN_DOCK)}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M3 5h12M3 9h12M3 13h12" />
      </svg>
    </button>
  );
}
