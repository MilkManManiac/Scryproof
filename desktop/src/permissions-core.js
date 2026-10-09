/** Embedded game frames never inherit the top-level app's device permissions. */
const GRANTED = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);
/** A game frame gets exactly one thing: fullscreen, and only from the activities origin. Nothing else leaks down. */
export function shellPermission(url, permission, mainFrame = true, activitiesOrigin = '') {
  if (!mainFrame) {
    if (permission !== 'fullscreen' || !activitiesOrigin) return false;
    try { return new URL(url).origin === activitiesOrigin; } catch { return false; }
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
