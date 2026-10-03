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
