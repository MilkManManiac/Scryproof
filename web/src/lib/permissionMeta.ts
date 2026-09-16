/**
 * Human labels for the permission bits.
 *
 * The masks and their meaning live in `@gooffline/shared`; this file is purely
 * how they read on screen. The descriptions matter more than they look: a
 * permission screen where every row is a two-word label is how people grant
 * MANAGE_ROLES to a friend without understanding they have handed over the
 * server. Each line says what the bit actually lets someone do.
 */

import { Permission, type PermissionName } from '@gooffline/shared';

export interface PermissionMeta {
  name: PermissionName;
  bit: bigint;
  label: string;
  description: string;
  /** Meaningless outside a channel of this type; hidden in channel overwrites. */
  scope: 'both' | 'text' | 'voice';
}

export interface PermissionGroup {
  name: string;
  /** Shown on the group heading in the role editor. */
  note: string;
  permissions: PermissionMeta[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    name: 'Text',
    note: 'What someone can do in a text channel.',
    permissions: [
      {
        name: 'VIEW_CHANNEL',
        bit: Permission.VIEW_CHANNEL,
        label: 'View channel',
        description:
          'See the channel exists at all. Denied, the channel is invisible: it reports "does not exist", not "forbidden".',
        scope: 'both',
      },
      {
        name: 'SEND_MESSAGES',
        bit: Permission.SEND_MESSAGES,
        label: 'Send messages',
        description: 'Post. Without it the composer is visible but refuses, and says why.',
        scope: 'text',
      },
      {
        name: 'MANAGE_MESSAGES',
        bit: Permission.MANAGE_MESSAGES,
        label: 'Manage messages',
        description: "Delete anyone's messages. Editing someone else's is never possible.",
        scope: 'text',
      },
      {
        name: 'EMBED_LINKS',
        bit: Permission.EMBED_LINKS,
        label: 'Embed links',
        description: 'Links unfurl into previews rather than staying plain text.',
        scope: 'text',
      },
      {
        name: 'ATTACH_FILES',
        bit: Permission.ATTACH_FILES,
        label: 'Attach files',
        description: 'Upload images and files to this server.',
        scope: 'text',
      },
      {
        name: 'ADD_REACTIONS',
        bit: Permission.ADD_REACTIONS,
        label: 'Add reactions',
        description: 'React to messages.',
        scope: 'text',
      },
      {
        name: 'MENTION_EVERYONE',
        bit: Permission.MENTION_EVERYONE,
        label: 'Mention everyone',
        description: 'Ping the whole server at once. Worth keeping narrow.',
        scope: 'text',
      },
      {
        name: 'READ_MESSAGE_HISTORY',
        bit: Permission.READ_MESSAGE_HISTORY,
        label: 'Read history',
        description:
          'See messages sent before they arrived. Without it they only see what happens while they are watching.',
        scope: 'text',
      },
    ],
  },
  {
    name: 'Voice',
    note: 'Voice, video and screen share.',
    permissions: [
      {
        name: 'CONNECT',
        bit: Permission.CONNECT,
        label: 'Connect',
        description: 'Join a voice channel.',
        scope: 'voice',
      },
      {
        name: 'SPEAK',
        bit: Permission.SPEAK,
        label: 'Speak',
        description: 'Transmit audio. Without it they can join and listen.',
        scope: 'voice',
      },
      {
        name: 'VIDEO',
        bit: Permission.VIDEO,
        label: 'Camera',
        description: 'Turn a camera on.',
        scope: 'voice',
      },
      {
        name: 'SHARE_SCREEN',
        bit: Permission.SHARE_SCREEN,
        label: 'Share screen',
        description: 'Share a screen or a window.',
        scope: 'voice',
      },
      {
        name: 'MUTE_MEMBERS',
        bit: Permission.MUTE_MEMBERS,
        label: 'Mute members',
        description: 'Server-mute someone so they cannot transmit.',
        scope: 'voice',
      },
      {
        name: 'DEAFEN_MEMBERS',
        bit: Permission.DEAFEN_MEMBERS,
        label: 'Deafen members',
        description: 'Server-deafen someone so they receive nothing.',
        scope: 'voice',
      },
      {
        name: 'MOVE_MEMBERS',
        bit: Permission.MOVE_MEMBERS,
        label: 'Move members',
        description: 'Drag someone into another voice channel, or disconnect them.',
        scope: 'voice',
      },
      {
        name: 'PRIORITY_SPEAKER',
        bit: Permission.PRIORITY_SPEAKER,
        label: 'Priority speaker',
        description: 'Everyone else is ducked while they talk.',
        scope: 'voice',
      },
    ],
  },
  {
    name: 'Membership',
    note: 'Who gets in and what they are called. Server-wide; channel overwrites ignore these.',
    permissions: [
      {
        name: 'CREATE_INVITE',
        bit: Permission.CREATE_INVITE,
        label: 'Create invite',
        description: 'Mint a link that lets someone new join this server.',
        scope: 'both',
      },
      {
        name: 'KICK_MEMBERS',
        bit: Permission.KICK_MEMBERS,
        label: 'Kick members',
        description: 'Remove someone. They can come back with a new invite.',
        scope: 'both',
      },
      {
        name: 'BAN_MEMBERS',
        bit: Permission.BAN_MEMBERS,
        label: 'Ban members',
        description: 'Remove someone and keep them out until the ban is lifted.',
        scope: 'both',
      },
      {
        name: 'CHANGE_NICKNAME',
        bit: Permission.CHANGE_NICKNAME,
        label: 'Change own nickname',
        description: 'Set their own per-server name.',
        scope: 'both',
      },
      {
        name: 'MANAGE_NICKNAMES',
        bit: Permission.MANAGE_NICKNAMES,
        label: 'Manage nicknames',
        description: "Change other people's nicknames.",
        scope: 'both',
      },
    ],
  },
  {
    name: 'Administration',
    note: 'Give these out slowly. Every one of them can be used to take the server.',
    permissions: [
      {
        name: 'MANAGE_CHANNELS',
        bit: Permission.MANAGE_CHANNELS,
        label: 'Manage channels',
        description: 'Create, rename and delete channels and categories.',
        scope: 'both',
      },
      {
        name: 'MANAGE_ROLES',
        bit: Permission.MANAGE_ROLES,
        label: 'Manage roles',
        description:
          'Edit roles below their own and set channel permissions. They can never grant a permission they do not already hold.',
        scope: 'both',
      },
      {
        name: 'MANAGE_SERVER',
        bit: Permission.MANAGE_SERVER,
        label: 'Manage server',
        description: 'Rename the server and change its settings.',
        scope: 'both',
      },
      {
        name: 'VIEW_AUDIT_LOG',
        bit: Permission.VIEW_AUDIT_LOG,
        label: 'View audit log',
        description: 'Read the record of who changed what.',
        scope: 'both',
      },
      {
        name: 'ADMINISTRATOR',
        bit: Permission.ADMINISTRATOR,
        label: 'Administrator',
        description:
          'Every permission, everywhere, and every channel overwrite ignored. This is the whole server. Only the owner is above it.',
        scope: 'both',
      },
    ],
  },
];

/** Flat lookup, for rendering an audit-log diff or a single row. */
export const PERMISSION_META: Record<PermissionName, PermissionMeta> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) => group.permissions).map((meta) => [meta.name, meta]),
) as Record<PermissionName, PermissionMeta>;

/**
 * Overwrites on a channel only make sense for permissions that apply inside a
 * channel. Kicking someone is not a per-channel idea, and offering it there
 * would imply the server honours it.
 */
export function groupsForChannel(type: 'text' | 'voice'): PermissionGroup[] {
  const inGroup = (name: string) =>
    PERMISSION_GROUPS.find((group) => group.name === name)?.permissions ?? [];

  return [
    {
      name: 'General',
      note: 'Denying this hides the channel entirely rather than refusing access to it.',
      permissions: [PERMISSION_META.VIEW_CHANNEL],
    },
    {
      name: type === 'voice' ? 'Voice' : 'Text',
      note:
        type === 'voice'
          ? 'Audio, video and screen share in this channel.'
          : 'Posting and reading in this channel.',
      permissions: inGroup(type === 'voice' ? 'Voice' : 'Text').filter(
        (meta) => meta.name !== 'VIEW_CHANNEL',
      ),
    },
  ];
}

/**
 * A category can hold both text and voice channels, so its overwrites offer
 * both sets. Server-level permissions are still absent for the same reason
 * they are absent from a channel: an overwrite cannot grant them, and offering
 * the row would imply otherwise.
 */
export function groupsForCategory(): PermissionGroup[] {
  const inGroup = (name: string) =>
    PERMISSION_GROUPS.find((group) => group.name === name)?.permissions ?? [];

  return [
    {
      name: 'General',
      note: 'Denying this hides every channel in the category rather than refusing access to them.',
      permissions: [PERMISSION_META.VIEW_CHANNEL],
    },
    {
      name: 'Text',
      note: 'Posting and reading in the text channels under this category.',
      permissions: inGroup('Text').filter((meta) => meta.name !== 'VIEW_CHANNEL'),
    },
    {
      name: 'Voice',
      note: 'Audio, video and screen share in the voice channels under this category.',
      permissions: inGroup('Voice').filter((meta) => meta.name !== 'VIEW_CHANNEL'),
    },
  ];
}
