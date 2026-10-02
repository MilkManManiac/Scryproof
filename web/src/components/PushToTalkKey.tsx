/**
 * The push-to-talk row in the voice settings: the key, and anything the
 * person should know about it before it fails them on a Mac.
 */

import { accessibilityMissing, isMacPlatform, onMacApp, openPermissionSettings } from '../lib/desktop';
import { usePermissions } from '../lib/desktop-hooks';
import { keyLabel } from '../lib/voice-prefs';

/** Either side of Cmd, Option, Control or Shift. */
export const isModifierKey = (code: string): boolean => /^(Meta|Alt|Control|Shift)(Left|Right)$/.test(code);

/**
 * One sentence for a modifier key, which the system uses for its own
 * shortcuts: Cmd-Tab takes the window away while the key is down. Nothing for
 * an ordinary key, and nothing off a Mac, where this is not the case.
 */
export function pushKeyWarning(code: string, mac: boolean): string | null {
  return mac && isModifierKey(code) ? 'Cmd-Tab and other system shortcuts will fight this key.' : null;
}

export function PushToTalkKeyRow({
  code,
  capturing,
  onCapture,
  mac,
  needsAccessibility,
}: {
  code: string;
  capturing: boolean;
  onCapture: () => void;
  mac: boolean;
  needsAccessibility: boolean;
}) {
  const warning = pushKeyWarning(code, mac);
  return (
    <>
      <div className="toggle-row">
        <span>
          Key to hold
          <span className="field-note">Pick one you do not type with.</span>
          {warning ? <span className="field-note warning">{warning}</span> : null}
        </span>
        <button type="button" className="button secondary inline" onClick={onCapture}>
          {capturing ? 'Press a key…' : keyLabel(code)}
        </button>
      </div>
      {needsAccessibility ? (
        <div className="toggle-row">
          <span>
            Accessibility
            <span className="field-note warning">
              macOS needs the Accessibility switch on for Scryproof to hear this key while another app is in front.
            </span>
          </span>
          <button type="button" className="button secondary inline" onClick={() => openPermissionSettings('accessibility')}>
            Open System Settings
          </button>
        </div>
      ) : null}
    </>
  );
}

export function PushToTalkKey({ code, capturing, onCapture }: { code: string; capturing: boolean; onCapture: () => void }) {
  // Looked at again whenever the window is back in front, so the explanation
  // goes away by itself after the trip to System Settings.
  const permission = usePermissions();
  return (
    <PushToTalkKeyRow
      code={code}
      capturing={capturing}
      onCapture={onCapture}
      mac={onMacApp || isMacPlatform()}
      needsAccessibility={accessibilityMissing(permission)}
    />
  );
}
