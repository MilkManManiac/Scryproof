/** Embedded game frames never inherit the top-level app's device permissions. */
const GRANTED = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);
/** A game frame may fill the screen. The microphone it may ask for (`gameMic`), never the camera or anything else. */
const ACTIVITIES_ORIGIN = 'https://activities.scryproof.com';
const micOnly = (media) => (Array.isArray(media) ? media.length > 0 && media.every((m) => m === 'audio') : media === 'audio');
const fromActivities = (url) => {
  try { return new URL(url).origin === ACTIVITIES_ORIGIN; } catch { return false; }
};

/**
 * Whether this is a game frame asking for the microphone only (Pass-along
 * vocals). Not granted here: the person is asked first (`gameMicConsent`),
 * because the games come from the box and their sound is not end-to-end
 * encrypted (audit 2026-10-10, finding 15).
 */
export const gameMic = (url, permission, mainFrame = true, media = null) =>
  !mainFrame && permission === 'media' && micOnly(media) && fromActivities(url);

/**
 * Ask once per app run. `ask()` resolves true for Allow; the answer, either
 * way, holds until the app quits. Requests that arrive while the question is
 * up share it. An ask that fails counts as Don't allow.
 */
export function gameMicConsent(ask) {
  let answer = null;
  let asking = null;
  const consent = () => {
    if (answer !== null) return Promise.resolve(answer);
    asking ??= Promise.resolve()
      .then(ask)
      .catch(() => false)
      .then((yes) => (answer = yes === true));
    return asking;
  };
  /** The answer so far, for the synchronous permission check: null until asked. */
  consent.answer = () => answer;
  return consent;
}

export function shellPermission(url, permission, mainFrame = true) {
  if (!mainFrame) return permission === 'fullscreen' && fromActivities(url);
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
