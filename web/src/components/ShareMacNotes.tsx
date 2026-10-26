/**
 * What the share picker says on a Mac: native sound capability and the
 * permission that has to be turned on first.
 */

import { onMacApp, openPermissionSettings, screenRecordingMissing } from '../lib/desktop';
import { usePermissions } from '../lib/desktop-hooks';

/**
 * Sound goes out only if the shell offered it and the person opted in.
 */
export const soundToShare = (mac: boolean, offered: boolean, chosen: boolean): boolean => offered && chosen;

/** The sound switch, or the reason an unsupported Mac has none. */
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
  if (mac && !offered) {
    return (
      <label className="share-picker-sound">
        <input type="checkbox" className="perm-switch" checked={false} disabled />
        <span>Sound sharing needs macOS 14.2 or newer and the latest Scryproof app.</span>
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
        macOS needs Screen Recording turned on for Scryproof before it can share a screen or a window. If no prompt appears, add Scryproof from Applications using the + button in that pane. If Scryproof is already
        listed and on, turn it off and on again: macOS kept the entry from an older copy of the app. After turning it on, quit Scryproof with Cmd-Q and
        reopen it. Closing the window keeps Scryproof running.
      </span>
      <button type="button" className="button secondary inline" onClick={() => openPermissionSettings('screen')}>
        Open System Settings
      </button>
    </div>
  );
}

/** Looked at again whenever the window is back in front, so it goes once the trip to System Settings is done. */
export const ScreenRecordingNote = () => <ScreenRecordingNoteView missing={screenRecordingMissing(usePermissions())} />;
