/**
 * Who may have which device, decided here with no Electron so `node --test`
 * can run it. `main.js` asks `permissionDecision` on every request and every
 * check, and does the one thing this file cannot: put a question to the
 * person.
 *
 * The app's own page (`app://scryproof`) is trusted with the call devices.
 * An embedded game (an Activities frame) never inherits them: it may fill the
 * screen, and it may ask for the microphone (Pass-along vocals), but that one
 * is 'ask', not 'grant': the shell shows a dialog once a session, because the
 * game's page comes from the box, not from inside this installer, and what the
 * game records is not encrypted the way a call is (audit 2026-10-10, finding
 * 15). Never the camera, never the screen, never from any other origin.
 */
const GRANTED = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);
const ACTIVITIES_ORIGIN = 'https://activities.scryproof.com';
const micOnly = (media) => (Array.isArray(media) ? media.length > 0 && media.every((m) => m === 'audio') : media === 'audio');

/** 'grant', 'deny' or 'ask' (the person decides; `main.js` remembers an Allow for the session). */
export function permissionDecision(url, permission, mainFrame = true, media = null) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'deny';
  }
  if (!mainFrame) {
    if (parsed.origin !== ACTIVITIES_ORIGIN) return 'deny';
    if (permission === 'fullscreen') return 'grant';
    if (permission === 'media' && micOnly(media)) return 'ask';
    return 'deny';
  }
  if (!GRANTED.has(permission)) return 'deny';
  return parsed.protocol === 'app:' && parsed.host === 'scryproof' && !parsed.username && !parsed.password ? 'grant' : 'deny';
}

/** The old yes-or-no answer: only an outright grant is true. An 'ask' is false until the person has said yes. */
export const shellPermission = (url, permission, mainFrame = true, media = null) =>
  permissionDecision(url, permission, mainFrame, media) === 'grant';

/**
 * The words of the microphone question, for the shell's dialog. Plain: which
 * site is asking, what it gets, and that it is not a call. The game's name is
 * not known here (the frame's path is the game's business), so the host is
 * named instead.
 */
export function frameMicPrompt(url) {
  let host = 'this game';
  try {
    host = new URL(url).host;
  } catch { /* the decision above already refused anything unparseable */ }
  return {
    message: `Let the game at ${host} use your microphone?`,
    detail: 'The game records what it hears and keeps it on the Scryproof box. This is not a call: what the game records is not encrypted end to end. Scryproof will not ask again until you quit the app.',
    buttons: ['Allow', 'Don\'t allow'],
  };
}

/** How long a refusal holds before the game may ask again: long enough that a looping game cannot spam the dialog. */
export const REFUSAL_HOLD_MS = 10_000;
