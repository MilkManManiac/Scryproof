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
  /** The line under a name: "at work", "running the game tonight". */
  statusText: 80,
  pinsPerChannel: 50,
  message: { max: 8000 },
  attachmentsPerMessage: 10,
  attachmentBytes: 100 * 1024 * 1024,
  /**
   * A file in a DM is locked and opened whole, in the browser's memory, so it
   * is held to a size a laptop can do that with.
   */
  dmFileBytes: 50 * 1024 * 1024,
  emojiName: { min: 2, max: 32 },
  emojisPerServer: 50,
  /** An emoji is drawn at text height, so anything larger is wasted bytes. */
  emojiBytes: 256 * 1024,
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

/* ------------------------------- custom emoji ------------------------------- */

/**
 * An emoji name, and the `:name:` it is written as.
 *
 * Deliberately narrow: lowercase, digits and underscore only. A name is typed
 * between colons in the middle of a sentence, so anything that could also be
 * punctuation would make the boundaries ambiguous, and case-insensitive
 * matching would let `:Cat:` and `:cat:` be two different emoji that look the
 * same in the list.
 */
const EMOJI_NAME_SOURCE = String.raw`[a-z0-9_]{${LIMITS.emojiName.min},${LIMITS.emojiName.max}}`;
const EMOJI_NAME_RE = new RegExp(`^${EMOJI_NAME_SOURCE}$`);
const EMOJI_TOKEN_RE = new RegExp(`^:${EMOJI_NAME_SOURCE}:$`);

export const emojiToken = (name: string): string => `:${name}:`;

export const isEmojiName = (value: string): boolean => EMOJI_NAME_RE.test(value);

/** Whether a string is a whole `:name:`, which is how a custom reaction is stored. */
export const isEmojiToken = (value: string): boolean => EMOJI_TOKEN_RE.test(value);

/** The name inside a `:name:`, or null when it is not one. */
export function emojiNameFrom(token: string): string | null {
  return isEmojiToken(token) ? token.slice(1, -1) : null;
}

/* ---------------------------------- links ---------------------------------- */

/**
 * Only http and https ever become something clickable. Every other scheme
 * stays flat text, and that is the whole defence: `javascript:` and `data:`
 * are how a message body turns into code, and a link that is never built
 * cannot be clicked.
 *
 * Nothing is fetched to make a preview. An unfurl means somebody asks a
 * stranger's server about a link, and whichever end does the asking — our box
 * on everyone's behalf, or each browser on its own — puts a third party in the
 * data path. So a link here is a link, and the picture is the one you see
 * after you decide to go.
 */
const LINK_SOURCE = String.raw`\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+`;

/** Punctuation at the end belongs to the sentence, not to the address. */
const LINK_TRAILING = `.,;:!?'"‘’“”`;
const LINK_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function trimLink(raw: string): string {
  let text = raw;
  while (text.length > 0) {
    const last = text[text.length - 1]!;

    if (LINK_TRAILING.includes(last)) {
      text = text.slice(0, -1);
      continue;
    }
    // A closing bracket is part of the address only if the address opened one,
    // which is what keeps "(see https://x.test/a_(b))" from losing its tail.
    const opener = LINK_BRACKETS[last];
    if (opener && text.split(last).length > text.split(opener).length) {
      text = text.slice(0, -1);
      continue;
    }
    break;
  }
  return text;
}

/**
 * Where a link actually goes. A bare `www.` gets https and never http:
 * guessing downward would quietly take someone off TLS.
 */
export function hrefFor(text: string): string | null {
  const candidate = /^www\./i.test(text) ? `https://${text}` : text;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
}

/** Body text split into plain runs, mentions, emoji, links and spoilers, for drawing. */
export type ContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; userId: string }
  | { kind: 'everyone' }
  /**
   * A `:name:` that is shaped like a custom emoji. Whether the server actually
   * has one by that name is not known here, so a renderer that cannot find it
   * draws `:name:` as plain text.
   */
  | { kind: 'emoji'; name: string }
  | { kind: 'link'; href: string; text: string }
  | { kind: 'spoiler'; parts: ContentPart[] };

/**
 * `||hidden||`. Non-greedy and at least one character between the pipes, so
 * `||||` (nothing to hide) and an unclosed `||` both fall through to plain
 * text instead of swallowing the rest of the line.
 */
const SPOILER_SOURCE = String.raw`\|\|([\s\S]+?)\|\|`;

// Group 1 mention, 2 emoji, 3 spoiler. The spoiler is tried before a link so
// `||https://…||` hides the link rather than swallowing the second `||`.
const CONTENT_SOURCE =
  String.raw`<@([0-9a-fA-F-]{36})>|:(${EMOJI_NAME_SOURCE}):|(?<=^|\s)@everyone(?=$|[\s.,!?])|` +
  SPOILER_SOURCE +
  '|' +
  LINK_SOURCE;

export function splitContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  // Rebuilt every call rather than shared: a /g regex carries lastIndex, and
  // one left behind by an earlier body would skip the start of the next.
  const pattern = new RegExp(CONTENT_SOURCE, 'g');
  let cursor = 0;

  const flushTextUpTo = (at: number) => {
    if (at > cursor) parts.push({ kind: 'text', text: content.slice(cursor, at) });
  };

  for (const match of content.matchAll(pattern)) {
    const at = match.index ?? 0;
    const whole = match[0];

    if (match[1]) {
      flushTextUpTo(at);
      parts.push({ kind: 'mention', userId: match[1].toLowerCase() });
      cursor = at + whole.length;
      continue;
    }
    if (match[2]) {
      flushTextUpTo(at);
      parts.push({ kind: 'emoji', name: match[2] });
      cursor = at + whole.length;
      continue;
    }
    if (whole === '@everyone') {
      flushTextUpTo(at);
      parts.push({ kind: 'everyone' });
      cursor = at + whole.length;
      continue;
    }
    if (match[3] !== undefined) {
      flushTextUpTo(at);
      // The same things a top-level body can hold work under a spoiler too,
      // a mention or a link still needs building once it is revealed.
      parts.push({ kind: 'spoiler', parts: splitContent(match[3]) });
      cursor = at + whole.length;
      continue;
    }

    const text = trimLink(whole);
    const href = hrefFor(text);
    // Not a link we will build. Leave it in the text run it came from.
    if (!href) continue;
    flushTextUpTo(at);
    parts.push({ kind: 'link', href, text });
    cursor = at + text.length;
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

export function validateEmojiName(value: string): Validation {
  if (value.length < LIMITS.emojiName.min) return fail(`An emoji name is at least ${LIMITS.emojiName.min} characters.`);
  if (value.length > LIMITS.emojiName.max) return fail(`An emoji name is at most ${LIMITS.emojiName.max} characters.`);
  if (!isEmojiName(value)) return fail('Emoji names use lowercase letters, numbers and underscore.');
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
