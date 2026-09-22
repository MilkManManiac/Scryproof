/**
 * Permission hooks.
 *
 * These decide what the UI *shows*. They never decide what is allowed — the
 * server does that on every request, and a client that lies about its mask
 * gets a 403 or a 404 for its trouble. Hiding a button the server would reject
 * is a courtesy, not a control.
 */

import { useEffect, useState } from 'react';
import { Permission, decodeMask, has } from '@scryproof/shared';
import type { Member, ServerDetail } from '@scryproof/shared';

import { api } from './api';

/** Server-wide mask from the ready frame. Channel overwrites are not applied. */
export function serverPermissions(server: ServerDetail | null): bigint {
  return server ? decodeMask(server.permissions) : 0n;
}

export function canOnServer(server: ServerDetail | null, wanted: bigint): boolean {
  const mask = serverPermissions(server);
  return has(mask, Permission.ADMINISTRATOR) || has(mask, wanted);
}

/**
 * The caller's effective permissions inside one channel, overwrites included.
 *
 * Fetched rather than computed locally. The client has the roles and its own
 * membership, but not every overwrite on every channel, and inventing a second
 * implementation of the resolution algorithm here is how the two drift apart.
 *
 * `version` is any value that changes when the server's shape changes; passing
 * the ServerDetail object itself is enough, because a refetch replaces it.
 */
export function useChannelPermissions(
  channelId: string | null,
  version: unknown,
): { mask: bigint; loading: boolean } {
  const [mask, setMask] = useState(0n);
  const [loading, setLoading] = useState(Boolean(channelId));

  useEffect(() => {
    if (!channelId) {
      setMask(0n);
      setLoading(false);
      return;
    }

    let live = true;
    setLoading(true);

    api.channels
      .myPermissions(channelId)
      .then(({ permissions }) => {
        if (live) setMask(decodeMask(permissions));
      })
      .catch(() => {
        // A 404 here means the channel is gone or was never visible. Treating
        // that as "no permissions" is the correct fail-closed behaviour.
        if (live) setMask(0n);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [channelId, version]);

  return { mask, loading };
}

export function can(mask: bigint, wanted: bigint): boolean {
  return has(mask, Permission.ADMINISTRATOR) || has(mask, wanted);
}

/**
 * When a member's timeout runs out, or null when none is. A time in the past
 * is not a timeout: nothing clears the column, so the client has to read it
 * the same way the server does.
 */
export function timeoutEndsAt(member: Member | null | undefined): Date | null {
  if (!member?.timeoutUntil) return null;
  const until = new Date(member.timeoutUntil);
  return until.getTime() > Date.now() ? until : null;
}

/**
 * The same answer, but the component is re-rendered the moment the timeout
 * runs out. Nothing on the wire announces the end of one, so without this the
 * composer would stay disabled until some unrelated render happened to come
 * along.
 */
export function useTimeoutEnd(member: Member | null | undefined): Date | null {
  const until = timeoutEndsAt(member);
  const [, redraw] = useState(0);
  const at = until?.getTime() ?? null;

  useEffect(() => {
    if (at === null) return;
    // A second past the end, so the recomputed comparison is certain to agree.
    const timer = setTimeout(() => redraw((count) => count + 1), Math.max(0, at - Date.now()) + 1000);
    return () => clearTimeout(timer);
  }, [at]);

  return until;
}
