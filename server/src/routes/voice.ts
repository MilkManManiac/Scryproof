/**
 * Voice endpoints.
 *
 * The token endpoint is the gate between "a member of this server" and "may
 * send audio into this room". Everything it grants is derived from the same
 * permission computation the rest of the API uses, and it refuses to issue a
 * token for a channel the caller cannot see.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { Permission, has } from '@scryproof/shared';

import { config } from '../config.js';
import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { channels } from '../db/schema.js';
import { HttpError, badRequest, notFound } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import * as hub from '../gateway/hub.js';
import { disconnectFromVoice } from '../gateway/voice.js';
import { visibleChannelIds } from '../services/server-detail.js';
import {
  createAccessToken,
  isLivekitConfigured,
  roomNameForChannel,
} from '../services/livekit.js';
import {
  requireChannelPermission,
  requireHigherThan,
  requireServerPermission,
} from '../services/permissions.js';

export async function registerVoiceRoutes(app: FastifyInstance): Promise<void> {
  /** Lets the client show "voice is not set up yet" instead of failing oddly. */
  app.get('/api/voice/config', async (request) => {
    requireUser(request);
    return { configured: isLivekitConfigured(), url: config.livekit.url || null };
  });

  app.post('/api/channels/:channelId/voice/token', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.CONNECT);

    const [channel] = await getDb().select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');
    if (channel.type !== 'voice') {
      throw badRequest('That is not a voice channel.', 'not_voice_channel');
    }

    if (!isLivekitConfigured()) {
      throw new HttpError(
        503,
        'voice_unavailable',
        'Voice is not configured on this server yet.',
      );
    }

    // The grant is built from the caller's actual permissions, so the media
    // server enforces them independently of anything the client sends. Someone
    // without SPEAK connects and hears, but cannot publish audio at all.
    const sources: string[] = [];
    if (has(ctx.channelPermissions, Permission.SPEAK)) sources.push('microphone');
    if (has(ctx.channelPermissions, Permission.VIDEO)) sources.push('camera');
    if (has(ctx.channelPermissions, Permission.SHARE_SCREEN)) {
      sources.push('screen_share', 'screen_share_audio');
    }

    const token = createAccessToken({
      room: roomNameForChannel(channelId),
      identity: user.id,
      name: user.displayName,
      canPublish: sources.length > 0,
      canSubscribe: true,
      sources,
    });

    logger.info({ userId: user.id, channelId }, 'issued voice token');

    return {
      token,
      url: config.livekit.url,
      room: roomNameForChannel(channelId),
      expiresInSeconds: config.livekit.tokenTtlSeconds,
      // What the client should offer in the UI. Enforcement is the grant above.
      can: {
        speak: has(ctx.channelPermissions, Permission.SPEAK),
        video: has(ctx.channelPermissions, Permission.VIDEO),
        screenShare: has(ctx.channelPermissions, Permission.SHARE_SCREEN),
      },
    };
  });

  app.get('/api/servers/:serverId/voice-states', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    const { requireMember } = await import('../services/permissions.js');
    const ctx = await requireMember(serverId, user.id);

    // Who is in a call is only news about a channel you can see. Returning the
    // lot would name a hidden voice channel and say who is sitting in it, which
    // is the same leak the gateway had.
    const visible = await visibleChannelIds(ctx);

    return {
      voiceStates: hub
        .allVoiceStatesFor([serverId])
        .filter((state) => visible.has(state.channelId ?? '')),
    };
  });

  /** Moderator action: pull someone out of voice. */
  app.post('/api/servers/:serverId/members/:userId/disconnect', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);

    const ctx = await requireServerPermission(serverId, actor.id, Permission.MOVE_MEMBERS);
    await requireHigherThan(ctx, userId);

    await disconnectFromVoice(serverId, userId);
    return { ok: true };
  });

  /**
   * Server mute and deafen. Unlike self-mute this is not a request the client
   * can refuse, so it lives on the server state rather than in the client's
   * own intent.
   */
  app.patch('/api/servers/:serverId/members/:userId/voice', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);
    const body = z
      .object({ serverMute: z.boolean().optional(), serverDeaf: z.boolean().optional() })
      .parse(request.body);

    const needed =
      (body.serverMute !== undefined ? Permission.MUTE_MEMBERS : 0n) |
      (body.serverDeaf !== undefined ? Permission.DEAFEN_MEMBERS : 0n);

    if (needed === 0n) throw badRequest('Nothing to change.', 'empty_update');

    const ctx = await requireServerPermission(serverId, actor.id, needed);
    await requireHigherThan(ctx, userId);

    const state = hub.getVoiceState(serverId, userId);
    if (!state) throw badRequest('That person is not in a voice channel.', 'not_in_voice');

    const updated = {
      ...state,
      ...(body.serverMute !== undefined ? { serverMute: body.serverMute } : {}),
      ...(body.serverDeaf !== undefined ? { serverDeaf: body.serverDeaf } : {}),
    };

    hub.setVoiceState(updated);
    await hub.announceVoiceState(serverId, updated.channelId, updated);

    return { ok: true };
  });
}
