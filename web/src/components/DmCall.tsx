/**
 * The call inside a direct message conversation: the button in its header,
 * the mark in the list, and the stage above its messages.
 *
 * Kept in its own file, in three small pieces, so the conversation screens
 * only have to place them. The call itself is the channel call's: the same
 * session, the same keys, the same stage and the same connection panel
 * (non-negotiables 2 and 7). Only the grant differs, and that is decided on
 * the server: being in the conversation is the permission.
 *
 * Starting a call rings the others while their app is open
 * (IncomingCall.tsx): a card with Answer and Ignore, and a soft ring. With the
 * app closed there is no push yet, so they find the mark in their list.
 */

import type { DmChannel, VoiceState } from '@scryproof/shared';

import { nameFor, useLocalNames } from '../lib/local-names';
import { useStore } from '../state/store';
import { useVoice } from '../state/useVoice';
import { VoiceGlyph } from './glyphs';
import { VoiceStage } from './VoicePanel';

interface DmCall {
  /** Everyone the server says is in this conversation's call. */
  occupants: VoiceState[];
  /** This person is one of them. */
  here: boolean;
  /** This device is joining, in, or failed to join this call. */
  mine: boolean;
}

function useDmCall(dmId: string): DmCall {
  const { state } = useStore();
  const voice = useVoice();
  const occupants = Object.values(state.voiceStates).filter((entry) => entry.dmId === dmId);
  return {
    occupants,
    here: occupants.some((entry) => entry.userId === state.user?.id),
    mine: voice.dmId === dmId,
  };
}

/** Call, Join call or Leave call, for the conversation's header. */
export function DmCallButton({ dm }: { dm: DmChannel }) {
  const { state, joinDmCall, leaveVoice } = useStore();
  const voice = useVoice();
  const { occupants, here, mine } = useDmCall(dm.id);

  // The server refuses a call across a block either way. Hiding the button
  // for the side that did the blocking only saves them a pointless refusal;
  // the other side finds out the way they would writing a message.
  const selfId = state.user?.id ?? null;
  if (dm.members.some((member) => member.id !== selfId && state.blocks.has(member.id))) return null;

  const joining = mine && !here && voice.phase === 'connecting';
  const label = here ? 'Leave call' : joining ? 'Joining…' : occupants.length > 0 ? 'Join call' : 'Call';

  return (
    <button
      type="button"
      className={here ? 'button secondary inline dm-call-toggle' : 'button inline dm-call-toggle'}
      disabled={joining}
      title={
        here
          ? 'Hang up. The others stay in the call.'
          : 'Voice, camera and screen, encrypted end to end. It rings for anyone with the app open.'
      }
      onClick={() => (here ? leaveVoice() : joinDmCall(dm.id))}
    >
      {label}
    </button>
  );
}

/** A mark on a conversation's row while anyone is in its call. */
export function DmCallMark({ dmId }: { dmId: string }) {
  const { occupants } = useDmCall(dmId);
  if (occupants.length === 0) return null;
  return (
    <span className="voice-flag in-voice dm-call-mark" title="In a call" aria-label="In a call">
      <VoiceGlyph />
    </span>
  );
}

/**
 * The stage, above the messages, while there is a call to show: someone is in
 * it, or this device is joining it or failed to. Otherwise nothing, so a
 * conversation with no call looks as it always did.
 */
export function DmCallStage({ dm }: { dm: DmChannel }) {
  const { state } = useStore();
  useLocalNames();
  const { occupants, mine } = useDmCall(dm.id);
  if (occupants.length === 0 && !mine) return null;

  const others = dm.members.filter((member) => member.id !== state.user?.id);
  const title = others.length > 0
    ? `Call with ${others.map((member) => nameFor(member.id, member.displayName)).join(', ')}`
    : 'Call';

  return (
    <div className="dm-call">
      <VoiceStage dmId={dm.id} channelName={title} />
    </div>
  );
}
