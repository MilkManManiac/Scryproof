/**
 * The four notification choices in a channel's or server's right-click menu
 * (Wes, 2026-10-01: "right click a channel and hit like show popups").
 * Replaces the single Mute item. The one in force has a check mark; a channel
 * following its server says what the server is set to.
 */

import { useSyncExternalStore } from 'react';

import { notifyPrefs, ownPlaceMode } from '../lib/notify';
import type { PlaceMode } from '../lib/notify';
import { MenuItem } from './Menu';

const LABELS: Record<PlaceMode, string> = {
  default: 'Follow my settings',
  watch: 'Every message',
  mentions: 'Mentions only',
  mute: 'Mute',
};

function notes(kind: 'text' | 'voice' | 'server'): Record<PlaceMode, string> {
  return {
    default: 'Whatever Notifications says for each kind of thing.',
    watch:
      kind === 'voice'
        ? 'A sound and a pop-up when someone joins or goes live.'
        : 'A sound and a pop-up for every message, wherever you are.',
    mentions: 'Only when someone mentions you. Unread still counts.',
    mute: 'No sound, no pop-up, not even mentions. Unread still shows.',
  };
}

export function PlaceModeItems({
  id,
  scope,
  kind,
  serverId,
  onDone,
}: {
  id: string;
  scope: 'server' | 'channel';
  kind: 'text' | 'voice' | 'server';
  /** A channel's server, to say what "follow" means here. */
  serverId?: string;
  onDone: () => void;
}) {
  const prefs = useSyncExternalStore(notifyPrefs.subscribe, notifyPrefs.get);
  const current = ownPlaceMode(prefs, id);
  const inherited = scope === 'channel' && serverId ? ownPlaceMode(prefs, serverId) : 'default';
  const text = notes(kind);

  return (
    <>
      <div className="menu-heading">Notifications</div>
      {(['default', 'watch', 'mentions', 'mute'] as const).map((mode) => (
        <MenuItem
          key={mode}
          note={mode === 'default' && inherited !== 'default' ? `Same as the server: ${LABELS[inherited].toLowerCase()}.` : text[mode]}
          onClick={() => {
            notifyPrefs.setPlace(id, scope, mode);
            onDone();
          }}
        >
          <span className="menu-check" aria-hidden="true">
            {current === mode ? '✓' : ''}
          </span>
          {LABELS[mode]}
        </MenuItem>
      ))}
      <div className="menu-divider" />
    </>
  );
}
