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
 * picker's sound switch exists only where the shell can capture the machine's
 * own sound (Windows, as `share-menu.js` canShareSound says); on a Mac or
 * Linux the share goes out silent and the hint must not offer sound.
 */
export function idleShareHint(desktop: boolean, canShareSound: boolean): string {
  if (!desktop) return 'Choose this Scryproof tab when sharing. Friends in your call can press Watch on your stream.';
  return canShareSound
    ? 'Share the Scryproof window so friends can watch. Enable sound only if it will not capture your call.'
    : 'Share the Scryproof window so friends can watch. This screen share has no sound yet, so friends will not hear the game.';
}

/** What to do with a downloaded update: a Mac drags the new app over the old one; Windows runs the installer. */
export function updateFollowUp(mac: boolean): string {
  return mac
    ? 'and replace the old app with the new one when your call is over.'
    : 'and run the installer when your call is over.';
}
