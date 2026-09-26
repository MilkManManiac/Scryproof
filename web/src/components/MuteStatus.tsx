/**
 * Mute and deafen you cannot miss: a red strip saying which, that undoes it
 * when clicked, and a short "You're muted" when you talk into a muted mic.
 * `lib/mute-state.ts` decides the words and when to speak up.
 */

import { useSyncExternalStore } from 'react';
import type { VoiceState } from '@scryproof/shared';

import { muteLabel, mutedTalkNote } from '../lib/mute-state';
import { HeadphonesGlyph, MicGlyph } from './glyphs';

type Patch = { selfMute?: boolean; selfDeaf?: boolean };

export function MuteBanner({
  state,
  onChange,
  where,
}: {
  state: VoiceState | undefined;
  onChange: (patch: Patch) => void;
  where: 'panel' | 'call';
}) {
  const talking = useSyncExternalStore(mutedTalkNote.subscribe, mutedTalkNote.visible);
  const label = muteLabel(state);
  if (!label) return null;
  // By your name, the microphone and headphones buttons already turn red for
  // your own mute; the strip there is for a moderator's, which you cannot undo
  // and ought to know about (2026-09-26, with the bar's redesign).
  if (where === 'panel' && label.undo) return null;
  const glyph = label.kind === 'deafened' ? <HeadphonesGlyph size={16} off /> : <MicGlyph size={16} off />;
  const action = label.undo ? (label.kind === 'deafened' ? 'Undeafen' : 'Unmute') : null;
  const className = `mute-banner ${where}${label.undo ? '' : ' locked'}${talking ? ' nudge' : ''}`;
  const body = (
    <>
      <span className="mute-banner-glyph">{glyph}</span>
      <span className="mute-banner-text">{label.text}</span>
      {action ? <span className="mute-banner-action">{action}</span> : null}
    </>
  );
  const undo = label.undo;
  if (!undo) {
    return (
      <div className={className} role="status" title={label.detail}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={className} title={label.detail} aria-label={label.detail} onClick={() => onChange(undo)}>
      {body}
    </button>
  );
}

/** "You're muted", above your name, for a few seconds after you talk while muted. */
export function MutedTalkNote({ onUnmute }: { onUnmute: () => void }) {
  const visible = useSyncExternalStore(mutedTalkNote.subscribe, mutedTalkNote.visible);
  if (!visible) return null;
  return (
    <div className="muted-talk" role="status">
      <MicGlyph size={16} off />
      <span className="muted-talk-text">
        <strong>You're muted.</strong> Nobody can hear you.
      </span>
      <button
        type="button"
        className="muted-talk-unmute"
        onClick={() => {
          mutedTalkNote.hide();
          onUnmute();
        }}
      >
        Unmute
      </button>
    </div>
  );
}
