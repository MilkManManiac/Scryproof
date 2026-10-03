/** Embedded game frames never inherit the top-level app's device permissions. */
const GRANTED = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);
export function shellPermission(url, permission, mainFrame = true) {
  if (!mainFrame || !GRANTED.has(permission)) return false;
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
