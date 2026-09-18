/**
 * The order of the sidebar: categories, and the channels inside each.
 *
 * One list, the way the sidebar draws it, with a handle on every row. Drag a
 * row or focus its handle and use the arrow keys, exactly as the role list
 * works, because two ways of reordering things in one app is one too many.
 *
 * Moving a channel past a heading moves it into that category, and that is not
 * cosmetic: the category is a permission layer under the channel's own, so a
 * channel dragged into a private category becomes private on the way in. The
 * note under the list says so, because the gesture does not.
 *
 * Every move is one request carrying the whole layout. A drag past four rows
 * is one gesture, not four.
 */

import { useEffect, useState } from 'react';
import { Permission } from '@gooffline/shared';
import type { Channel, ServerDetail } from '@gooffline/shared';

import { ApiError, api } from '../../lib/api';
import { groupChannels } from '../../lib/channel-order';
import type { ChannelGroup } from '../../lib/channel-order';
import type { Authority } from './authority';

type Row =
  | { kind: 'heading'; group: ChannelGroup }
  | { kind: 'channel'; group: ChannelGroup; channel: Channel };

function flatten(groups: ChannelGroup[]): Row[] {
  return groups.flatMap((group) => [
    { kind: 'heading' as const, group },
    ...group.channels.map((channel) => ({ kind: 'channel' as const, group, channel })),
  ]);
}

const clamp = (index: number, length: number) => Math.max(0, Math.min(length - 1, index));

export function LayoutPane({ server, authority }: { server: ServerDetail; authority: Authority }) {
  const canArrange = authority.can(Permission.MANAGE_CHANNELS);

  // Local copy so the list moves the moment it is dragged, and the server's
  // answer (a refetch of the whole server) settles it afterwards.
  const [groups, setGroups] = useState<ChannelGroup[]>(() =>
    groupChannels(server, { keepEmpty: true }),
  );
  useEffect(() => setGroups(groupChannels(server, { keepEmpty: true })), [server]);

  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = flatten(groups);

  async function commit(next: ChannelGroup[]) {
    setGroups(next);
    setSaving(true);
    setError(null);
    try {
      await api.servers.setLayout(server.id, {
        categories: next.flatMap((group) => (group.id ? [group.id] : [])),
        channels: next.flatMap((group) =>
          group.channels.map((channel) => ({ id: channel.id, categoryId: group.id })),
        ),
      });
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save the order.');
      setGroups(groupChannels(server, { keepEmpty: true }));
    } finally {
      setSaving(false);
    }
  }

  /** Move a category heading to sit where another heading is. */
  function moveCategory(fromId: string, toIndex: number) {
    // The "no category" group is the floor and does not move; everything
    // else is renumbered around it.
    const floor = groups.filter((group) => group.id === null);
    const movable = groups.filter((group) => group.id !== null);
    const from = movable.findIndex((group) => group.id === fromId);
    const target = clamp(toIndex, movable.length);
    if (from === -1 || from === target) return;
    const next = [...movable];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved!);
    void commit([...floor, ...next]);
  }

  /** Put a channel at `position` inside `groupId`, whatever it was before. */
  function placeChannel(channelId: string, groupId: string | null, position: number) {
    let moved: Channel | undefined;
    const stripped = groups.map((group) => {
      const found = group.channels.find((channel) => channel.id === channelId);
      if (found) moved = found;
      return { ...group, channels: group.channels.filter((channel) => channel.id !== channelId) };
    });
    if (!moved) return;
    const next = stripped.map((group) => {
      if (group.id !== groupId) return group;
      const list = [...group.channels];
      list.splice(Math.max(0, Math.min(list.length, position)), 0, moved!);
      return { ...group, channels: list };
    });
    void commit(next);
  }

  /** One step up or down through the flat list, crossing headings into the next category. */
  function stepChannel(channel: Channel, group: ChannelGroup, step: -1 | 1) {
    const at = group.channels.findIndex((entry) => entry.id === channel.id);
    const within = at + step;
    if (within >= 0 && within < group.channels.length) {
      placeChannel(channel.id, group.id, within);
      return;
    }
    // Off the end of this category: land in the neighbouring one, at the
    // edge nearest to where you came from.
    const groupAt = groups.findIndex((entry) => entry.id === group.id);
    const neighbour = groups[groupAt + step];
    if (!neighbour) return;
    placeChannel(channel.id, neighbour.id, step === -1 ? neighbour.channels.length : 0);
  }

  function dropOn(row: Row) {
    if (!dragging) return;
    const draggedRow = rows.find(
      (entry) =>
        (entry.kind === 'channel' && entry.channel.id === dragging) ||
        (entry.kind === 'heading' && entry.group.id === dragging),
    );
    if (!draggedRow) return;

    if (draggedRow.kind === 'heading') {
      // Headings reorder among headings; dropping onto a channel means "the
      // category that channel is in".
      const headings = rows.filter((entry) => entry.kind === 'heading' && entry.group.id !== null);
      const target = headings.findIndex((entry) => entry.group.id === row.group.id);
      if (row.group.id !== null && target !== -1) moveCategory(draggedRow.group.id!, target);
      return;
    }

    if (row.kind === 'heading') {
      placeChannel(draggedRow.channel.id, row.group.id, 0);
    } else {
      // Dropping onto a channel puts you where it is, in its category, and it
      // shifts down. Positions are counted after you have left your old slot,
      // so coming from above it in the same list, its index is one lower.
      const list = row.group.channels;
      const targetAt = list.findIndex((entry) => entry.id === row.channel.id);
      const fromAt = list.findIndex((entry) => entry.id === draggedRow.channel.id);
      const position = fromAt !== -1 && fromAt < targetAt ? targetAt - 1 : targetAt;
      placeChannel(draggedRow.channel.id, row.group.id, position);
    }
  }

  return (
    <>
      <h2 className="settings-heading">Layout</h2>
      <p className="settings-note">
        The sidebar in the order it is drawn. Drag a row, or focus its handle and use the arrow
        keys. Moving a channel under a different heading puts it in that category,{' '}
        <strong>and the category&rsquo;s permissions come with it</strong>: a channel dragged into a
        private category is private the moment it lands.
      </p>

      {error ? <div className="error">{error}</div> : null}

      <div className="layout-list" aria-busy={saving}>
        {rows.map((row) => {
          const key = row.kind === 'heading' ? `h:${row.group.id ?? 'none'}` : `c:${row.channel.id}`;
          const id = row.kind === 'heading' ? row.group.id : row.channel.id;
          const draggable = canArrange && id !== null;
          const label = row.kind === 'heading' ? row.group.name : row.channel.name;

          return (
            <div
              key={key}
              className={[
                'role-entry-wrap',
                row.kind === 'heading' ? 'layout-heading' : 'layout-channel',
                dragging !== null && dragging === id ? 'dragging' : '',
              ]
                .join(' ')
                .trim()}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!dragging) return;
                event.preventDefault();
                dropOn(row);
                setDragging(null);
              }}
            >
              {draggable ? (
                <button
                  type="button"
                  className="role-grip"
                  draggable
                  aria-label={`Reorder ${label}`}
                  title="Drag, or use the arrow keys"
                  onDragStart={() => setDragging(id)}
                  onDragEnd={() => setDragging(null)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    const step = event.key === 'ArrowUp' ? -1 : 1;
                    if (row.kind === 'heading') {
                      const headings = groups.filter((group) => group.id !== null);
                      const at = headings.findIndex((group) => group.id === row.group.id);
                      moveCategory(row.group.id!, at + step);
                    } else {
                      stepChannel(row.channel, row.group, step);
                    }
                  }}
                >
                  &#8942;&#8942;
                </button>
              ) : (
                <span className="role-grip placeholder" aria-hidden="true" />
              )}

              <div className={row.kind === 'heading' ? 'role-entry layout-heading-name' : 'role-entry'}>
                {row.kind === 'channel' ? (
                  <span className="channel-sigil">{row.channel.type === 'voice' ? '♫' : '#'}</span>
                ) : null}
                <span className="role-entry-name">{label}</span>
                {row.kind === 'heading' && row.group.channels.length === 0 ? (
                  <span className="role-locked">empty</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
