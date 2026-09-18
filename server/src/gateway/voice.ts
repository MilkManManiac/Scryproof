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

import { Permission, VOICE_SIGNAL_MAX_BYTES, has } from '@gooffline/shared';
import type { VoiceSignal, VoiceState } from '@gooffline/shared';

import { getDb } from '../db/index.js';
import { channels } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { consume } from '../lib/rate-limit.js';
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
    for (const { announcement, leftChannelId } of hub.clearVoiceStatesForUser(connection.userId)) {
      await hub.announceVoiceState(announcement.serverId, leftChannelId, announcement);
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

  // One call at a time. A person has one microphone, and their device holds
  // one set of call keys; standing in two servers' voice channels at once
  // would leave a ghost in whichever one the client is not actually connected to.
  for (const { announcement, leftChannelId } of hub.clearVoiceStatesForUser(
    connection.userId,
    channel.serverId,
  )) {
    await hub.announceVoiceState(announcement.serverId, leftChannelId, announcement);
  }

  const previous = hub.getVoiceState(channel.serverId, connection.userId);

  // Moving between channels leaves the old one first, so nobody appears in two
  // places at once.
  if (previous && previous.channelId !== channel.id) {
    await hub.announceVoiceState(channel.serverId, previous.channelId, {
      ...previous,
      channelId: null,
      sharingScreen: false,
      cameraOn: false,
    });
  }

  const staying = previous?.channelId === channel.id;

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
    // Left unsaid, these stay as they were: muting must not switch the camera
    // icon off. They do not follow anyone into a different channel.
    sharingScreen: (intent.sharingScreen ?? (staying && previous.sharingScreen)) && has(permissions, Permission.SHARE_SCREEN),
    cameraOn: (intent.cameraOn ?? (staying && previous.cameraOn)) && has(permissions, Permission.VIDEO),
  };

  hub.setVoiceState(state);
  await hub.announceVoiceState(channel.serverId, channel.id, state);

  logger.debug(
    { userId: connection.userId, channelId: channel.id },
    'voice state updated',
  );
}

/** Force someone out of voice. Used by MUTE_MEMBERS and MOVE_MEMBERS. */
export async function disconnectFromVoice(serverId: string, userId: string): Promise<void> {
  const state = hub.getVoiceState(serverId, userId);
  if (!state) return;

  hub.setVoiceState({ ...state, channelId: null });
  await hub.announceVoiceState(serverId, state.channelId, {
    ...state,
    channelId: null,
    sharingScreen: false,
    cameraOn: false,
  });
}

/**
 * Pass a sealed key-agreement message to the other people in a voice channel.
 *
 * This is the whole of the server's part in voice encryption, and it is a
 * postman's part. It checks that the sender is standing in the channel they
 * name, that the recipient is too, and that the envelope is a sane size. It
 * does not open the envelope. `payload` is never parsed, stored or logged, and
 * nothing in it would be any use to us if it were: announcements are public
 * keys, and wrapped keys open only on the one device they were sealed for.
 *
 * `from` is stamped here, but clients do not rely on it. Every announcement is
 * signed by the device that made it, so a server that lied about `from` would
 * produce a message that fails verification, not one that is believed.
 */
export function handleVoiceSignal(
  connection: hub.Connection,
  signal: VoiceSignal & { to?: string },
): void {
  if (typeof signal !== 'object' || signal === null) return;
  const { channelId, epoch, kind, payload, to } = signal;

  if (typeof channelId !== 'string') return;
  if (typeof epoch !== 'number' || !Number.isInteger(epoch)) return;
  if (kind !== 'announce' && kind !== 'key') return;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return;
  if (to !== undefined && typeof to !== 'string') return;

  // Twenty-five people rotating at once is about six hundred messages from
  // each of them. This is far above that and far below a flood.
  if (!consume(`voice-signal:${connection.id}`, 2000, 10_000).allowed) return;

  if (Buffer.byteLength(JSON.stringify(payload)) > VOICE_SIGNAL_MAX_BYTES) return;

  // Only someone in the channel may speak into it, and only about the present.
  // A message labelled with an old epoch is about a set of people that no
  // longer exists, and every client would refuse it anyway.
  const occupants = hub.voiceOccupants(channelId);
  if (!occupants.includes(connection.userId)) return;
  if (epoch !== hub.voiceEpoch(channelId)) return;

  const recipients = to === undefined ? occupants : occupants.includes(to) ? [to] : [];

  for (const userId of recipients) {
    if (userId === connection.userId) continue;
    hub.sendToUser(userId, {
      t: 'voice_signal',
      d: { channelId, epoch, kind, payload, from: connection.userId },
    });
  }
}
