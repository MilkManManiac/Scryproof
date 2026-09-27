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

import { Permission, has, houseRules } from '@scryproof/shared';

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
  roomNameForDm,
} from '../services/livekit.js';
import { requireDmCallAllowed } from '../services/dm-calls.js';
import {
  assertNotTimedOut,
  computePermissionsInChannel,
  loadMemberContext,
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
    // No token, so a timed-out member cannot reach the media server at all:
    // hiding the Join button alone would leave the room one fetch away.
    assertNotTimedOut(ctx);

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
    //
    // `unknown` is the soundboard's track, which rides beside the microphone
    // and so needs the same permission. LiveKit cannot tell a grant "audio
    // only" for a source, so an unknown-source video is possible in principle;
    // every client unsubscribes from one and draws nothing (voice-session.ts).
    const sources: string[] = [];
    if (has(ctx.channelPermissions, Permission.SPEAK)) sources.push('microphone', 'unknown');
    if (has(ctx.channelPermissions, Permission.VIDEO)) sources.push('camera');
    if (has(ctx.channelPermissions, Permission.SHARE_SCREEN)) {
      sources.push('screen_share', 'screen_share_audio');
    }

    const token = createAccessToken({
      room: roomNameForChannel(channelId),
      identity: user.id,
      name: houseRules(user.displayName),
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

  /**
   * The call inside a direct message conversation. Being in the conversation
   * is the whole grant: no roles, so everyone in it may speak, show a camera
   * and share a screen. Refused, from the same function the gateway asks, to
   * anyone not in it, to either side of a block, and to someone who no longer
   * shares a server with the others. The encryption is the channel call's,
   * unchanged: the room is only a name to it.
   */
  app.post('/api/dms/:dmId/voice/token', async (request) => {
    const user = requireUser(request);
    const { dmId } = z.object({ dmId: z.string() }).parse(request.params);

    await requireDmCallAllowed(dmId, user.id);

    if (!isLivekitConfigured()) {
      throw new HttpError(
        503,
        'voice_unavailable',
        'Voice is not configured on this server yet.',
      );
    }

    const room = roomNameForDm(dmId);
    const token = createAccessToken({
      room,
      identity: user.id,
      name: houseRules(user.displayName),
      canPublish: true,
      canSubscribe: true,
      sources: ['microphone', 'unknown', 'camera', 'screen_share', 'screen_share_audio'],
    });

    logger.info({ userId: user.id, dmId }, 'issued dm call token');

    return {
      token,
      url: config.livekit.url,
      room,
      expiresInSeconds: config.livekit.tokenTtlSeconds,
      can: { speak: true, video: true, screenShare: true },
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
   * Moderator action: move someone from the voice channel they are in to
   * another. The person moved must be allowed in the new channel (seeing it
   * and CONNECT, overwrites included): moving is not a way round a private
   * channel. The mover must be able to see it too, or its id would answer
   * "does this hidden channel exist".
   *
   * The server tells the person first and then takes them out of the old
   * channel. Their device joins the new one by itself, which is the only way
   * a join can happen: the call's keys are made on the device.
   *
   * An app from before moves existed does not know the event, and moving it
   * only dropped the person from the call (Wes, 2026-09-27: the one friend
   * it dropped was the one whose app never asked for the new room). So the
   * device in the call has to have said it follows moves, and a move is
   * refused otherwise, with what to do.
   */
  app.post('/api/servers/:serverId/members/:userId/move', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.body);

    const ctx = await requireServerPermission(serverId, actor.id, Permission.MOVE_MEMBERS);
    await requireHigherThan(ctx, userId);

    const [channel] = await getDb().select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channel || channel.serverId !== serverId) throw notFound('That channel does not exist.', 'unknown_channel');
    if (!has(await computePermissionsInChannel(ctx, channel.id), Permission.VIEW_CHANNEL)) {
      throw notFound('That channel does not exist.', 'unknown_channel');
    }
    if (channel.type !== 'voice') throw badRequest('That is not a voice channel.', 'not_voice');

    const state = hub.getVoiceState(serverId, userId);
    if (!state?.channelId) throw badRequest('That person is not in a voice channel.', 'not_in_voice');
    if (state.channelId === channel.id) return { ok: true };

    const target = await loadMemberContext(serverId, userId);
    if (!target) throw notFound('That member is not in this server.', 'unknown_member');

    const devices = hub.connectionsForUser(userId);
    const inCall = devices.filter((device) => device.callChannelId === state.channelId);
    if (!(inCall.length > 0 ? inCall : devices).some((device) => device.followsMoves)) {
      throw new HttpError(
        409,
        'outdated_app',
        'Their app is out of date, so a move would only drop them from the call. They need to click Reload now (or Restart to install) first.',
      );
    }
    const theirs = await computePermissionsInChannel(target, channel.id);
    if (!has(theirs, Permission.VIEW_CHANNEL) || !has(theirs, Permission.CONNECT)) {
      throw new HttpError(403, 'target_cannot_connect', 'They are not allowed in that channel.');
    }

    hub.sendToUser(userId, {
      t: 'voice_move',
      d: { serverId, fromChannelId: state.channelId, channelId: channel.id, by: actor.id },
    });
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
