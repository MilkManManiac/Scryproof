/**
 * The `/invite/CODE` link.
 *
 * Whoever pastes this expects it to just work: land on a screen that already
 * knows which server it is, not the normal app with a join dialog to hunt
 * for. The parser is a pure function so it can be tested without a DOM; the
 * rest of this module is the bit of memory that carries the code from boot
 * (where the URL is read and cleaned up) through sign-in to wherever the
 * join modal ends up rendering.
 */

const INVITE_PATH = /^\/invite\/([a-z0-9]+)$/i;

/** Pull an invite code out of a pathname, or null if it is not that link. */
export function parseInvitePath(pathname: string): string | null {
  const match = pathname.match(INVITE_PATH);
  return match ? match[1]!.toLowerCase() : null;
}

let pendingCode: string | null = null;

/**
 * Called once at boot, before anything renders. If the path is an invite
 * link, the code is stashed in memory and the address bar is put back to
 * `/` so a reload does not re-run the same join.
 */
export function captureInviteFromLocation(
  pathname: string,
  replaceUrl: (url: string) => void,
): void {
  const code = parseInvitePath(pathname);
  if (!code) return;
  pendingCode = code;
  replaceUrl('/');
}

/** The stashed code, if any, without clearing it. */
export function peekPendingInviteCode(): string | null {
  return pendingCode;
}

/** The stashed code, if any, and forgets it: for whoever finally acts on it. */
export function takePendingInviteCode(): string | null {
  const code = pendingCode;
  pendingCode = null;
  return code;
}
