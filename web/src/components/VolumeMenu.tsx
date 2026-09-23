/*
 * Right-click a person in a call: how loud they are, for you.
 *
 * The same setting as the slider on their profile card and on their tile
 * (voicePrefs.setVolumeFor, kept in this browser only), where Discord keeps
 * it: on the right-click. Wes looked for it there and did not find the card.
 *
 * Opened at the pointer rather than under the row, with a fixed position, so
 * a tile near the bottom of the voice stage (which clips its overflow) does
 * not cut it off.
 */

import { useSyncExternalStore, type SyntheticEvent } from 'react';

import { voicePrefs } from '../lib/voice-prefs';
import { Menu, MenuItem } from './Menu';

/** Where a right-click landed, kept far enough from the edges for the menu to fit. */
export interface MenuSpot {
  x: number;
  y: number;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 150;

export function spotOf(event: { clientX: number; clientY: number }): MenuSpot {
  return {
    x: Math.max(4, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 4)),
    y: Math.max(4, Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 4)),
  };
}

/**
 * What the volume was before "Mute for me", per person, so unmuting puts back
 * 150 percent rather than 100. Only for this tab: after a reload, unmuting
 * goes back to 100.
 */
const beforeMute = new Map<string, number>();

// The menu sits inside a row or a tile that has its own click (the profile
// card, the inline slider). Nothing done in the menu should reach it.
const keep = (event: SyntheticEvent) => event.stopPropagation();

export function VolumeMenu({
  userId,
  name,
  spot,
  onClose,
}: {
  userId: string;
  name: string;
  spot: MenuSpot;
  onClose: () => void;
}) {
  const prefs = useSyncExternalStore(voicePrefs.subscribe, voicePrefs.get);
  const volume = prefs.volumes[userId] ?? 1;
  const percent = Math.round(volume * 100);
  const silent = volume === 0;

  return (
    <div
      className="volume-menu"
      style={{ left: spot.x, top: spot.y }}
      onClick={keep}
      onKeyDown={keep}
      onContextMenu={(event) => {
        event.preventDefault();
        keep(event);
      }}
    >
      <Menu onClose={onClose}>
        <label className="volume-menu-slider">
          <span className="volume-menu-label">Volume of {name}</span>
          <input
            type="range"
            className="voice-range"
            min={0}
            max={200}
            step={5}
            value={percent}
            onChange={(event) => voicePrefs.setVolumeFor(userId, Number(event.target.value) / 100)}
            aria-label={`Volume of ${name}, for you only`}
          />
          <span className="menu-item-note">{percent}% &middot; only you hear the change</span>
        </label>
        <MenuItem
          note={silent ? 'Back to how loud they were.' : 'They are not told, and everyone else still hears them.'}
          onClick={() => {
            if (silent) {
              voicePrefs.setVolumeFor(userId, beforeMute.get(userId) ?? 1);
              beforeMute.delete(userId);
            } else {
              beforeMute.set(userId, volume);
              voicePrefs.setVolumeFor(userId, 0);
            }
          }}
        >
          {silent ? 'Unmute for me' : 'Mute for me'}
        </MenuItem>
      </Menu>
    </div>
  );
}
