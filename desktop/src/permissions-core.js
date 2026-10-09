/** Embedded game frames never inherit the top-level app's device permissions. */
const GRANTED = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);
/** The one thing a game frame may ask for: to fill the screen. Never a device. */
const ACTIVITIES_ORIGIN = 'https://activities.scryproof.com';
export function shellPermission(url, permission, mainFrame = true) {
  if (!mainFrame) {
    if (permission !== 'fullscreen') return false;
    try { return new URL(url).origin === ACTIVITIES_ORIGIN; } catch { return false; }
  }
  if (!GRANTED.has(permission)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'app:' &&
      parsed.host === 'scryproof' &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
