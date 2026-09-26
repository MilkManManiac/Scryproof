/**
 * The card above your name while you are in a call, where Discord keeps it:
 * which call, hang up, and the three things you reach for in one, camera,
 * screen and soundboard, as big labelled buttons.
 *
 * Wes, 2026-09-26: the soundboard should be "as easy to find as discord".
 * Before this it was an unlabelled speaker among the small tools of the bar,
 * the same speaker that means "in voice" everywhere else.
 *
 * The board belongs to the server whose call you are in, which need not be
 * the one on screen. It is offered once its track is up and not while a
 * moderator has you muted; the session refuses in both cases anyway. A call
 * in a conversation has no server, so no board.
 */

import { useState } from 'react';
import type { VoiceState } from '@scryproof/shared';

import { useStore } from '../state/store';
import { useVoice } from '../state/useVoice';
import { CameraGlyph, HangUpGlyph, ScreenGlyph, SoundboardGlyph } from './glyphs';
import { SoundBoard } from './SoundBoard';

export function VoiceDock({ mine }: { mine: VoiceState }) {
  const { state, voice: session, leaveVoice } = useStore();
  const call = useVoice();
  const [boardOpen, setBoardOpen] = useState(false);

  const server = mine.serverId ? state.servers[mine.serverId] : undefined;
  const channel = server?.channels.find((entry) => entry.id === mine.channelId);
  const where = server ? `${channel?.name ?? 'Voice'} / ${server.name}` : 'Call in a conversation';
  const connected = call.phase === 'connected';
  const boardReady = Boolean(server) && call.soundboard && !mine.serverMute;
  const boardWhy = !server
    ? 'The soundboard belongs to a server; a call in a conversation has none'
    : mine.serverMute
      ? 'A moderator has muted you'
      : 'Getting the soundboard ready';

  return (
    <div className="voice-dock">
      <div className="voice-dock-head">
        <span className={connected ? 'voice-dock-signal live' : 'voice-dock-signal'} aria-hidden="true" />
        <span className="voice-dock-words">
          <span className={connected ? 'voice-dock-state live' : 'voice-dock-state'}>
            {connected ? 'Voice connected' : call.phase === 'failed' ? 'Could not connect' : 'Connecting'}
          </span>
          <span className="voice-dock-where" title={where}>
            {where}
          </span>
        </span>
        <button type="button" className="icon-button danger voice-dock-leave" title="Leave the call" aria-label="Leave the call" onClick={() => leaveVoice()}>
          <HangUpGlyph size={18} />
        </button>
      </div>
      <div className="voice-dock-row">
        <button
          type="button"
          className={call.camera ? 'voice-dock-button on' : 'voice-dock-button'}
          disabled={!connected || !call.can.video}
          title={call.can.video ? (call.camera ? 'Turn camera off' : 'Turn camera on') : 'Not allowed here'}
          onClick={() => void session.setCamera(!call.camera)}
        >
          <CameraGlyph size={18} />
          <span>Camera</span>
        </button>
        <button
          type="button"
          className={call.sharing ? 'voice-dock-button on' : 'voice-dock-button'}
          disabled={!connected || !call.can.screenShare}
          title={call.can.screenShare ? (call.sharing ? 'Stop sharing' : 'Share your screen') : 'Not allowed here'}
          onClick={() => void session.setScreenShare(!call.sharing)}
        >
          <ScreenGlyph size={18} />
          <span>Screen</span>
        </button>
        <button
          type="button"
          className={boardOpen ? 'voice-dock-button on' : 'voice-dock-button'}
          disabled={!boardReady}
          title={boardReady ? 'Play a sound for everyone in the call' : boardWhy}
          aria-expanded={boardOpen}
          // The board shuts on any click outside it; this one toggles it instead.
          onMouseDown={(event) => {
            if (boardOpen) event.stopPropagation();
          }}
          onClick={() => setBoardOpen((open) => !open)}
        >
          <SoundboardGlyph size={18} />
          <span>Soundboard</span>
        </button>
      </div>
      {boardOpen && boardReady && server ? <SoundBoard server={server} onClose={() => setBoardOpen(false)} /> : null}
    </div>
  );
}
