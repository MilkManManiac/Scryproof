/**
 * What the share picker says on a Mac: the sound that is not there, and the
 * permission that has to be turned on first.
 */

import { onMacApp, openPermissionSettings, screenRecordingMissing } from '../lib/desktop';
import { usePermissions } from '../lib/desktop-hooks';

/**
 * Whether the share goes out with sound. Electron has no way to capture a
 * Mac's own sound, so on a Mac it never does, whatever the switch says.
 */
export const soundToShare = (mac: boolean, offered: boolean, chosen: boolean): boolean => !mac && offered && chosen;

/** The sound switch at the left of the footer: Windows's own, or the reason a Mac has none. */
export function ShareSound({
  mac,
  offered,
  label,
  checked,
  onChange,
}: {
  mac: boolean;
  /** Whether the shell says sound can go with this share. */
  offered: boolean;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  if (mac) {
    return (
      <label className="share-picker-sound">
        <input type="checkbox" className="perm-switch" checked={false} disabled />
        <span>No sound with a Mac screen share yet.</span>
      </label>
    );
  }
  if (!offered) return null;
  return (
    <label className="share-picker-sound">
      <input type="checkbox" className="perm-switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** The one sentence, and the button, shown while macOS has not let the app record the screen. */
export function ScreenRecordingNoteView({ missing }: { missing: boolean }) {
  if (!missing) return null;
  return (
    <div className="toggle-row">
      <span className="field-note warning">
        macOS needs Screen Recording turned on for Scryproof before it can share a screen or a window. After turning it on, quit
        and reopen Scryproof.
      </span>
      <button type="button" className="button secondary inline" onClick={() => openPermissionSettings('screen')}>
        Open System Settings
      </button>
    </div>
  );
}

/** Looked at again whenever the window is back in front, so it goes once the trip to System Settings is done. */
export const ScreenRecordingNote = () => <ScreenRecordingNoteView missing={screenRecordingMissing(usePermissions())} />;
