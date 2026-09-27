/*
 * A moderator's actions on someone in a server call, under the volume on the
 * right-click (or press-and-hold) menu, where Discord keeps them: mute or
 * deafen them for everyone, move them to another voice channel, disconnect
 * them. Wes, 2026-09-26: "an admin should be able to move who is in voice
 * calls kinda like disc".
 *
 * Shown by the server-wide mask, so a button can still be refused (they
 * outrank you, or are not allowed in the channel you picked); the refusal is
 * shown in the menu. The server decides every one of these.
 */

import { useState } from 'react';
import { Permission } from '@scryproof/shared';
import type { ServerDetail, VoiceState } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { canOnServer } from '../lib/usePermissions';
import { MenuItem } from './Menu';

/** Whether this person may do anything here at all, so callers can skip the menu. */
export function canModerateVoice(server: ServerDetail): boolean {
  return (
    canOnServer(server, Permission.MUTE_MEMBERS) ||
    canOnServer(server, Permission.DEAFEN_MEMBERS) ||
    canOnServer(server, Permission.MOVE_MEMBERS)
  );
}

export function VoiceModItems({
  server,
  voice,
  onDone,
}: {
  server: ServerDetail;
  voice: VoiceState;
  onDone: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mute = canOnServer(server, Permission.MUTE_MEMBERS);
  const deafen = canOnServer(server, Permission.DEAFEN_MEMBERS);
  const move = canOnServer(server, Permission.MOVE_MEMBERS);
  if (!mute && !deafen && !move) return null;

  const elsewhere = server.channels
    .filter((channel) => channel.type === 'voice' && channel.id !== voice.channelId)
    .sort((a, b) => a.position - b.position);

  const act = (work: Promise<unknown>) => {
    setProblem(null);
    work.then(onDone).catch((error: unknown) => {
      setProblem(error instanceof ApiError ? error.message : 'That did not work. Try again.');
    });
  };

  return (
    <>
      <div className="menu-heading">Moderator</div>
      {problem ? <p className="menu-problem">{problem}</p> : null}
      {mute ? (
        <MenuItem
          note={voice.serverMute ? 'They can talk again.' : 'Everyone stops hearing them until you undo it.'}
          onClick={() => act(api.voice.moderate(server.id, voice.userId, { serverMute: !voice.serverMute }))}
        >
          {voice.serverMute ? 'Unmute for everyone' : 'Mute for everyone'}
        </MenuItem>
      ) : null}
      {deafen ? (
        <MenuItem
          note={voice.serverDeaf ? 'They can hear the call again.' : 'They hear nothing until you undo it.'}
          onClick={() => act(api.voice.moderate(server.id, voice.userId, { serverDeaf: !voice.serverDeaf }))}
        >
          {voice.serverDeaf ? 'Undeafen' : 'Deafen'}
        </MenuItem>
      ) : null}
      {move && elsewhere.length > 0 ? (
        <MenuItem note={moving ? undefined : 'Or drag them onto another voice channel.'} onClick={() => setMoving((open) => !open)}>
          Move to…
        </MenuItem>
      ) : null}
      {move && moving
        ? elsewhere.map((channel) => (
            <MenuItem key={channel.id} onClick={() => act(api.voice.move(server.id, voice.userId, channel.id))}>
              <span className="menu-indent">♫ {channel.name}</span>
            </MenuItem>
          ))
        : null}
      {move ? (
        <MenuItem danger note="Out of the call. They can come back." onClick={() => act(api.voice.disconnect(server.id, voice.userId))}>
          Disconnect
        </MenuItem>
      ) : null}
    </>
  );
}
