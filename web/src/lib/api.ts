/**
 * API client.
 *
 * Same-origin fetch with cookies. There is no token in JavaScript anywhere in
 * this app: the session lives in an httpOnly cookie, so a cross-site script
 * cannot read it and cannot be replayed from another machine.
 */

import type {
  Attachment,
  AuditLogEntry,
  Category,
  Channel,
  Invite,
  MaskString,
  Member,
  Message,
  PublicUser,
  Role,
  SelfUser,
  Server,
  ServerDetail,
  VoiceState,
} from '@gooffline/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.code ?? 'error',
      payload?.message ?? `Request failed (${response.status}).`,
      payload?.details?.retryAfterSeconds,
    );
  }

  return payload as T;
}

const get = <T,>(path: string) => request<T>('GET', path);
const post = <T,>(path: string, body?: unknown) => request<T>('POST', path, body);
const patch = <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body);
const put = <T,>(path: string, body?: unknown) => request<T>('PUT', path, body);
const del = <T,>(path: string) => request<T>('DELETE', path);

export const api = {
  auth: {
    context: () => get<{ firstRun: boolean; inviteRequired: boolean }>('/api/auth/context'),
    me: () => get<{ user: SelfUser }>('/api/auth/me'),
    register: (input: {
      username: string;
      displayName?: string;
      password: string;
      inviteCode?: string;
    }) => post<{ user: SelfUser }>('/api/auth/register', input),
    login: (input: { username: string; password: string; totpCode?: string }) =>
      post<{ user?: SelfUser; totpRequired?: boolean }>('/api/auth/login', input),
    logout: () => post<{ ok: true }>('/api/auth/logout'),
    beginTotp: () => post<{ secret: string; uri: string; qr: string }>('/api/auth/totp/begin'),
    completeTotp: (secret: string, code: string) =>
      post<{ recoveryCodes: string[] }>('/api/auth/totp/complete', { secret, code }),
    disableTotp: (password: string) => post<{ ok: true }>('/api/auth/totp/disable', { password }),
    changePassword: (currentPassword: string, newPassword: string) =>
      post<{ ok: true }>('/api/auth/password', { currentPassword, newPassword }),
  },

  servers: {
    list: () => get<{ servers: ServerDetail[] }>('/api/servers'),
    one: (id: string) => get<{ server: ServerDetail }>(`/api/servers/${id}`),
    create: (name: string) => post<{ server: ServerDetail }>('/api/servers', { name }),
    update: (id: string, body: { name?: string }) =>
      patch<{ server: Server }>(`/api/servers/${id}`, body),
    remove: (id: string) => del<{ ok: true }>(`/api/servers/${id}`),
    leave: (id: string) => post<{ ok: true }>(`/api/servers/${id}/leave`),
    members: (id: string) => get<{ members: Member[] }>(`/api/servers/${id}/members`),
    kick: (serverId: string, userId: string) =>
      del<{ ok: true }>(`/api/servers/${serverId}/members/${userId}`),
    ban: (serverId: string, userId: string, reason?: string) =>
      put<{ ok: true }>(`/api/servers/${serverId}/bans/${userId}`, { reason }),
    bans: (serverId: string) =>
      get<{
        bans: {
          user: PublicUser;
          reason: string | null;
          bannedBy: string;
          createdAt: string;
        }[];
      }>(`/api/servers/${serverId}/bans`),
    unban: (serverId: string, userId: string) =>
      del<{ ok: true }>(`/api/servers/${serverId}/bans/${userId}`),
    setNickname: (serverId: string, userId: string, nickname: string | null) =>
      patch<{ ok: true }>(`/api/servers/${serverId}/members/${userId}`, { nickname }),
    setMemberRoles: (serverId: string, userId: string, roleIds: string[]) =>
      put<{ roleIds: string[] }>(`/api/servers/${serverId}/members/${userId}/roles`, { roleIds }),
    auditLog: (id: string) => get<{ entries: AuditLogEntry[] }>(`/api/servers/${id}/audit-log`),
  },

  channels: {
    create: (
      serverId: string,
      body: { name: string; type: 'text' | 'voice'; categoryId?: string | null },
    ) => post<{ channel: Channel }>(`/api/servers/${serverId}/channels`, body),
    update: (
      id: string,
      body: { name?: string; topic?: string | null; slowmodeSeconds?: number; categoryId?: string | null },
    ) => patch<{ channel: Channel }>(`/api/channels/${id}`, body),
    remove: (id: string) => del<{ ok: true }>(`/api/channels/${id}`),
    permissions: (id: string) =>
      get<{ overwrites: { targetType: string; targetId: string; allow: MaskString; deny: MaskString }[] }>(
        `/api/channels/${id}/permissions`,
      ),
    setOverwrite: (
      channelId: string,
      targetId: string,
      body: { targetType: 'role' | 'member'; allow: MaskString; deny: MaskString },
    ) => put<{ ok: true }>(`/api/channels/${channelId}/permissions/${targetId}`, body),
    clearOverwrite: (channelId: string, targetId: string) =>
      del<{ ok: true }>(`/api/channels/${channelId}/permissions/${targetId}`),
    myPermissions: (id: string) => get<{ permissions: MaskString }>(`/api/channels/${id}/me`),
  },

  categories: {
    create: (serverId: string, name: string) =>
      post<{ category: Category }>(`/api/servers/${serverId}/categories`, { name }),
    rename: (id: string, name: string) =>
      patch<{ category: Category }>(`/api/categories/${id}`, { name }),
    remove: (id: string) => del<{ ok: true }>(`/api/categories/${id}`),
    /**
     * A category's overwrites apply to every channel inside it, underneath
     * each channel's own. Same shape as the channel endpoints on purpose.
     */
    permissions: (id: string) =>
      get<{ overwrites: { targetType: string; targetId: string; allow: MaskString; deny: MaskString }[] }>(
        `/api/categories/${id}/permissions`,
      ),
    setOverwrite: (
      categoryId: string,
      targetId: string,
      body: { targetType: 'role' | 'member'; allow: MaskString; deny: MaskString },
    ) => put<{ ok: true }>(`/api/categories/${categoryId}/permissions/${targetId}`, body),
    clearOverwrite: (categoryId: string, targetId: string) =>
      del<{ ok: true }>(`/api/categories/${categoryId}/permissions/${targetId}`),
  },

  messages: {
    list: (channelId: string, options: { before?: string; limit?: number } = {}) => {
      const query = new URLSearchParams();
      if (options.before) query.set('before', options.before);
      if (options.limit) query.set('limit', String(options.limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return get<{ messages: Message[] }>(`/api/channels/${channelId}/messages${suffix}`);
    },
    send: (
      channelId: string,
      body: { content?: string; replyToId?: string; attachmentIds?: string[] },
    ) => post<{ message: Message }>(`/api/channels/${channelId}/messages`, body),
    edit: (id: string, content: string) =>
      patch<{ message: Message }>(`/api/messages/${id}`, { content }),
    remove: (id: string) => del<{ ok: true }>(`/api/messages/${id}`),
    react: (id: string, emoji: string) =>
      put<{ ok: true }>(`/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`, {}),
    unreact: (id: string, emoji: string) =>
      del<{ ok: true }>(`/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`),
    markRead: (channelId: string, messageId: string) =>
      put<{ ok: true }>(`/api/channels/${channelId}/read`, { messageId }),
  },

  roles: {
    list: (serverId: string) => get<{ roles: Role[] }>(`/api/servers/${serverId}/roles`),
    create: (serverId: string, body: { name: string; permissions?: MaskString; color?: string }) =>
      post<{ role: Role }>(`/api/servers/${serverId}/roles`, body),
    update: (
      id: string,
      body: {
        name?: string;
        permissions?: MaskString;
        color?: string | null;
        hoist?: boolean;
        mentionable?: boolean;
        position?: number;
      },
    ) => patch<{ role: Role }>(`/api/roles/${id}`, body),
    remove: (id: string) => del<{ ok: true }>(`/api/roles/${id}`),
    /** The whole order at once, highest first. See the route for why. */
    reorder: (serverId: string, roleIds: string[]) =>
      patch<{ roles: Role[] }>(`/api/servers/${serverId}/roles/order`, { roleIds }),
    members: (id: string) => get<{ members: PublicUser[] }>(`/api/roles/${id}/members`),
  },

  invites: {
    create: (serverId: string, expiresIn: '30m' | '6h' | '1d' | '7d' | 'never' = '7d') =>
      post<{ invite: Invite; url: string }>(`/api/servers/${serverId}/invites`, { expiresIn }),
    list: (serverId: string) => get<{ invites: Invite[] }>(`/api/servers/${serverId}/invites`),
    revoke: (code: string) => del<{ ok: true }>(`/api/invites/${code}`),
    createInstance: (maxUses = 1) =>
      post<{ invite: Invite; url: string }>('/api/instance-invites', { maxUses }),
    preview: (code: string) =>
      get<{ kind: 'server' | 'instance'; server: { id: string; name: string } | null }>(
        `/api/invites/${code}`,
      ),
    accept: (code: string) => post<{ server: ServerDetail }>(`/api/invites/${code}/accept`),
  },

  voice: {
    config: () => get<{ configured: boolean; url: string | null }>('/api/voice/config'),
    token: (channelId: string) =>
      post<{
        token: string;
        url: string;
        room: string;
        expiresInSeconds: number;
        can: { speak: boolean; video: boolean; screenShare: boolean };
      }>(`/api/channels/${channelId}/voice/token`),
    states: (serverId: string) =>
      get<{ voiceStates: VoiceState[] }>(`/api/servers/${serverId}/voice-states`),
  },

  users: {
    lookup: (ids: string[]) => post<{ users: PublicUser[] }>('/api/users/lookup', { ids }),
  },

  /** Uploads go through FormData, so they bypass the JSON helper above. */
  async upload(channelId: string, file: File): Promise<Attachment> {
    const form = new FormData();
    form.append('file', file);

    const response = await fetch(`/api/channels/${channelId}/attachments`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload?.code ?? 'upload_failed',
        payload?.message ?? 'Upload failed.',
      );
    }
    return payload.attachment as Attachment;
  },
};
