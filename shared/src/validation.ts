/**
 * Limits and validators shared by both sides, so the client can show a helpful
 * error before sending and the server can reject the same thing authoritatively
 * when it arrives. The server never trusts the client's copy of these.
 */

export const LIMITS = {
  username: { min: 2, max: 32 },
  displayName: { min: 1, max: 48 },
  password: { min: 10, max: 512 },
  serverName: { min: 1, max: 64 },
  channelName: { min: 1, max: 48 },
  categoryName: { min: 1, max: 48 },
  roleName: { min: 1, max: 48 },
  nickname: { min: 1, max: 48 },
  topic: { max: 512 },
  message: { max: 8000 },
  attachmentsPerMessage: 10,
  attachmentBytes: 100 * 1024 * 1024,
} as const;

/** Lowercase, digits, underscore, dot, hyphen. No leading or trailing marks. */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
/** Channel names follow the same shape so they stay URL-safe and predictable. */
const CHANNEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/* -------------------------------- mentions --------------------------------- */

/**
 * A mention travels inside the message body as `<@user-id>`, and everyone as
 * the literal `@everyone`. Ids, not names: a name can change or be shared, and
 * a body that said "@alex" would ping whoever is called alex next year.
 */
const MENTION_RE = /<@([0-9a-fA-F-]{36})>/g;
const EVERYONE_RE = /(^|\s)@everyone(?=$|[\s.,!?])/;

export const mentionToken = (userId: string): string => `<@${userId}>`;

export function parseMentions(content: string): { userIds: string[]; everyone: boolean } {
  const userIds = new Set<string>();
  for (const match of content.matchAll(MENTION_RE)) {
    if (match[1]) userIds.add(match[1].toLowerCase());
  }
  return { userIds: [...userIds], everyone: EVERYONE_RE.test(content) };
}

/** Body text split into plain runs and mentions, for drawing. */
export type ContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; userId: string }
  | { kind: 'everyone' };

export function splitContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const pattern = /<@([0-9a-fA-F-]{36})>|(?<=^|\s)@everyone(?=$|[\s.,!?])/g;
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push({ kind: 'text', text: content.slice(cursor, at) });
    parts.push(match[1] ? { kind: 'mention', userId: match[1].toLowerCase() } : { kind: 'everyone' });
    cursor = at + match[0].length;
  }
  if (cursor < content.length) parts.push({ kind: 'text', text: content.slice(cursor) });
  return parts;
}

/** Reactions are one emoji each. This is a length guard, not an emoji detector. */
export const REACTION_MAX_LENGTH = 32;
/** Different emoji on one message. Past this it is a wall, not a reaction. */
export const REACTIONS_PER_MESSAGE = 20;

export type Validation = { ok: true } | { ok: false; error: string };

const ok: Validation = { ok: true };
const fail = (error: string): Validation => ({ ok: false, error });

export function validateUsername(value: string): Validation {
  if (value.length < LIMITS.username.min) return fail(`Username must be at least ${LIMITS.username.min} characters.`);
  if (value.length > LIMITS.username.max) return fail(`Username must be at most ${LIMITS.username.max} characters.`);
  if (!USERNAME_RE.test(value)) {
    return fail('Username can use lowercase letters, numbers, dot, underscore and hyphen.');
  }
  return ok;
}

export function validateDisplayName(value: string): Validation {
  const trimmed = value.trim();
  if (trimmed.length < LIMITS.displayName.min) return fail('Display name cannot be empty.');
  if (trimmed.length > LIMITS.displayName.max) return fail(`Display name must be at most ${LIMITS.displayName.max} characters.`);
  return ok;
}

/**
 * Length beats character classes. A long passphrase is stronger and easier to
 * remember than a short one with a symbol bolted on, and forced complexity
 * pushes people toward patterns an attacker already guesses.
 */
export function validatePassword(value: string): Validation {
  if (value.length < LIMITS.password.min) {
    return fail(`Password must be at least ${LIMITS.password.min} characters. A short sentence works well.`);
  }
  if (value.length > LIMITS.password.max) return fail('Password is too long.');
  return ok;
}

export function validateChannelName(value: string): Validation {
  if (value.length < LIMITS.channelName.min) return fail('Channel name cannot be empty.');
  if (value.length > LIMITS.channelName.max) return fail(`Channel name must be at most ${LIMITS.channelName.max} characters.`);
  if (!CHANNEL_RE.test(value)) return fail('Channel names use lowercase letters, numbers and hyphens.');
  return ok;
}

export function validateServerName(value: string): Validation {
  const trimmed = value.trim();
  if (trimmed.length < LIMITS.serverName.min) return fail('Server name cannot be empty.');
  if (trimmed.length > LIMITS.serverName.max) return fail(`Server name must be at most ${LIMITS.serverName.max} characters.`);
  return ok;
}

export function validateRoleName(value: string): Validation {
  const trimmed = value.trim();
  if (trimmed.length < LIMITS.roleName.min) return fail('Role name cannot be empty.');
  if (trimmed.length > LIMITS.roleName.max) return fail(`Role name must be at most ${LIMITS.roleName.max} characters.`);
  return ok;
}

export function validateMessageContent(value: string): Validation {
  if (value.length > LIMITS.message.max) return fail(`Message must be at most ${LIMITS.message.max} characters.`);
  return ok;
}

/** Turn anything into a usable channel name rather than rejecting it. */
export function slugifyChannelName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.channelName.max) || 'channel';
}
