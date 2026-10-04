export type ActivityStatus = 'ready' | 'error' | 'ended';
/** Only the displayed game's own frame may report its status. */
export function readActivityStatus(
  event: MessageEvent,
  origin: string,
  frame: Window | null,
  gameId: string,
): ActivityStatus | null {
  if (event.origin !== origin || !frame || event.source !== frame) return null;
  const data = event.data;
  if (!data || data.type !== 'scryproof-activity' || data.game !== gameId)
    return null;
  return data.status === 'ready' ||
    data.status === 'error' ||
    data.status === 'ended'
    ? data.status
    : null;
}

/**
 * What the Activities toolbar says before gameplay is shared. The desktop
 * picker's sound switch is Windows's: Electron cannot capture a Mac's own
 * sound, so on a Mac the share goes out silent and the hint must not offer it.
 */
export function idleShareHint(desktop: boolean, mac: boolean): string {
  if (!desktop) return 'Choose this Scryproof tab when sharing. Friends in your call can press Watch on your stream.';
  return mac
    ? 'Share the Scryproof window so friends can watch. A Mac screen share has no sound yet, so friends will not hear the game.'
    : 'Share the Scryproof window so friends can watch. Enable sound only if it will not capture your call.';
}
