/**
 * Voice presence.
 *
 * Who is sitting in which voice channel, and whether they are muted, on
 * camera or sharing a screen. This is separate from the media path: LiveKit
 * moves the audio and video, while this tells everyone else what to draw.
 *
 * It is authoritative. A client can ask to join a channel, but the server
 * checks CONNECT before it agrees, and a client claiming to be sharing a
 * screen without SHARE_SCREEN is simply not believed.
 */

import { Permission, has } from '@gooffline/shared';
import type { VoiceState } from '@gooffline/shared';

import { getDb } from '../db/index.js';
import { channels } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { computePermissionsInChannel, loadMemberContext } from '../services/permissions.js';
import * as hub from './hub.js';

export interface VoiceStateIntent {
  channelId: string | null;
  selfMute?: boolean;
  selfDeaf?: boolean;
  sharingScreen?: boolean;
  cameraOn?: boolean;
}

export async function handleVoiceStateIntent(
  connection: hub.Connection,
  intent: VoiceStateIntent,
): Promise<void> {
  // Leaving: clear every voice state this user holds and tell their servers.
  if (intent.channelId === null) {
    for (const state of hub.clearVoiceStatesForUser(connection.userId)) {
      hub.broadcastToServer(state.serverId, { t: 'voice_state_update', d: state });
    }
    return;
  }

  const { eq } = await import('drizzle-orm');
  const [channel] = await getDb()
    .select()
    .from(channels)
    .where(eq(channels.id, intent.channelId))
    .limit(1);

  if (!channel || channel.type !== 'voice') return;
  if (!connection.servers.has(channel.serverId)) return;

  const ctx = await loadMemberContext(channel.serverId, connection.userId);
  if (!ctx) return;

  const permissions = await computePermissionsInChannel(ctx, channel.id);

  if (!has(permissions, Permission.CONNECT)) {
    connection.ws.send(
      JSON.stringify({
        t: 'error',
        d: { code: 'missing_permissions', message: 'You cannot join that voice channel.' },
      }),
    );
    return;
  }

  const previous = hub.getVoiceState(channel.serverId, connection.userId);

  // Moving between channels leaves the old one first, so nobody appears in two
  // places at once.
  if (previous && previous.channelId !== channel.id) {
    hub.broadcastToServer(channel.serverId, {
      t: 'voice_state_update',
      d: { ...previous, channelId: null, sharingScreen: false, cameraOn: false },
    });
  }

  const state: VoiceState = {
    userId: connection.userId,
    serverId: channel.serverId,
    channelId: channel.id,
    selfMute: intent.selfMute ?? previous?.selfMute ?? false,
    selfDeaf: intent.selfDeaf ?? previous?.selfDeaf ?? false,
    serverMute: previous?.serverMute ?? false,
    serverDeaf: previous?.serverDeaf ?? false,
    // A client cannot claim a capability it does not have. The media server
    // enforces this too, via the grant in the access token, but the member
    // list must not show a screen-share icon for someone who cannot share.
    sharingScreen: (intent.sharingScreen ?? false) && has(permissions, Permission.SHARE_SCREEN),
    cameraOn: (intent.cameraOn ?? false) && has(permissions, Permission.VIDEO),
  };

  hub.setVoiceState(state);
  hub.broadcastToServer(channel.serverId, { t: 'voice_state_update', d: state });

  logger.debug(
    { userId: connection.userId, channelId: channel.id },
    'voice state updated',
  );
}

/** Force someone out of voice. Used by MUTE_MEMBERS and MOVE_MEMBERS. */
export function disconnectFromVoice(serverId: string, userId: string): void {
  const state = hub.getVoiceState(serverId, userId);
  if (!state) return;

  hub.setVoiceState({ ...state, channelId: null });
  hub.broadcastToServer(serverId, {
    t: 'voice_state_update',
    d: { ...state, channelId: null, sharingScreen: false, cameraOn: false },
  });
}
