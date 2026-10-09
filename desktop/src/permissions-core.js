/** Embedded game frames never inherit the top-level app's device permissions. */
const GRANTED = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);
/** A game frame may fill the screen, and use the microphone (Pass-along vocals). Never the camera or anything else. */
const ACTIVITIES_ORIGIN = 'https://activities.scryproof.com';
const micOnly = (media) => (Array.isArray(media) ? media.length > 0 && media.every((m) => m === 'audio') : media === 'audio');
export function shellPermission(url, permission, mainFrame = true, media = null) {
  if (!mainFrame) {
    if (permission !== 'fullscreen' && !(permission === 'media' && micOnly(media))) return false;
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
