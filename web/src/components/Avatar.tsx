/**
 * Avatars.
 *
 * No image by default and no gravatar-style lookup, which would leak a hash of
 * every member's identity to a third party. The colour comes from the user id,
 * so a person looks the same to everyone without the server storing anything.
 */

import type { PresenceStatus, PublicUser } from '@gooffline/shared';

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function Avatar({
  user,
  name,
  small,
  presence,
}: {
  user: PublicUser;
  /** Override the label, e.g. a per-server nickname. */
  name?: string;
  small?: boolean;
  presence?: PresenceStatus;
}) {
  const label = name ?? user.displayName ?? user.username;

  return (
    <span
      className={small ? 'avatar small' : 'avatar'}
      style={{ background: user.accent }}
      aria-hidden="true"
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        initials(label)
      )}
      {presence ? <i className={`presence-dot ${presence}`} /> : null}
    </span>
  );
}
