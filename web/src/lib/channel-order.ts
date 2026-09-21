/**
 * The order channels appear in, in one place.
 *
 * The sidebar draws this and the keyboard steps through it. They have to be
 * the same list or Alt+Down goes somewhere that is not the next row down.
 */

import type { Channel, ServerDetail } from '@scryproof/shared';

export interface ChannelGroup {
  id: string | null;
  name: string;
  position: number;
  channels: Channel[];
}

/**
 * `keepEmpty` is for the sidebar of someone who may manage channels: the server
 * only sends them a category with nothing in it, so dropping it here would make
 * "New category" look like it did nothing. Everyone else never receives one.
 */
export function groupChannels(
  server: ServerDetail,
  options: { keepEmpty?: boolean } = {},
): ChannelGroup[] {
  const groups = new Map<string | null, ChannelGroup>();
  groups.set(null, { id: null, name: 'Channels', position: -1, channels: [] });

  for (const category of [...server.categories].sort((a, b) => a.position - b.position)) {
    groups.set(category.id, {
      id: category.id,
      name: category.name,
      position: category.position,
      channels: [],
    });
  }

  for (const channel of server.channels) {
    // A channel whose category was hidden from us still has to land somewhere.
    const bucket = groups.get(channel.categoryId) ?? groups.get(null)!;
    bucket.channels.push(channel);
  }

  return [...groups.values()]
    .filter((entry) => entry.channels.length > 0 || (options.keepEmpty && entry.id !== null))
    .sort((a, b) => a.position - b.position)
    .map((entry) => ({
      ...entry,
      channels: [...entry.channels].sort(
        (a, b) => a.position - b.position || a.name.localeCompare(b.name),
      ),
    }));
}

/** Every channel, top to bottom, as the sidebar reads. */
export function flatChannelOrder(server: ServerDetail): Channel[] {
  return groupChannels(server).flatMap((entry) => entry.channels);
}
