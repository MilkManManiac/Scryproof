/**
 * Mentions, between what a person types and what is stored.
 *
 * A stored message names people by id (`<@id>`), because names change. Nobody
 * should ever see or type that, so the message box works in `@Name` and this
 * file converts in both directions.
 */

import { emojiToken, mentionToken, splitContent } from '@scryproof/shared';
import type { ContentPart, Member } from '@scryproof/shared';

export const nameOf = (member: Member): string => member.nickname ?? member.user.displayName;

/**
 * What to type after the @ for this member: their name, unless somebody else
 * here has the same one, in which case their username, which is unique.
 */
export function mentionLabel(member: Member, members: Member[]): string {
  const name = nameOf(member);
  const shared = members.some(
    (other) => other.userId !== member.userId && nameOf(other).toLowerCase() === name.toLowerCase(),
  );
  return shared ? member.user.username : name;
}

const escapeForPattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Typed text to stored text. An @Name that matches nobody is left as plain text. */
export function fromDraft(text: string, members: Member[]): string {
  // Longest first, so "@Alex Stone" is not claimed by a member called "Alex".
  const labelled = members
    .map((member) => ({ member, label: mentionLabel(member, members) }))
    .sort((a, b) => b.label.length - a.label.length);

  let output = text;
  for (const { member, label } of labelled) {
    const pattern = new RegExp(`(^|\\s)@${escapeForPattern(label)}(?![\\w-])`, 'gi');
    output = output.replace(pattern, (_match, lead: string) => `${lead}${mentionToken(member.userId)}`);
  }
  return output;
}

function partToDraft(part: ContentPart, members: Member[]): string {
  if (part.kind === 'text') return part.text;
  // A link was never rewritten on the way in, so it goes back as it was.
  if (part.kind === 'link') return part.text;
  if (part.kind === 'everyone') return '@everyone';
  // An emoji is typed as `:name:` and stored as `:name:`, so editing gets
  // the text back exactly as it was written.
  if (part.kind === 'emoji') return emojiToken(part.name);
  if (part.kind === 'spoiler') {
    return `||${part.parts.map((inner) => partToDraft(inner, members)).join('')}||`;
  }
  if (part.kind === 'code') return `\`${part.text}\``;
  if (part.kind === 'style') {
    const mark = part.style === 'bold' ? '**' : part.style === 'strike' ? '~~' : '*';
    return `${mark}${part.parts.map((inner) => partToDraft(inner, members)).join('')}${mark}`;
  }
  const member = members.find((entry) => entry.userId === part.userId);
  return member ? `@${mentionLabel(member, members)}` : '@someone who left';
}

/** Stored text back to typed text, for editing a message. */
export function toDraft(content: string, members: Member[]): string {
  return splitContent(content)
    .map((part) => partToDraft(part, members))
    .join('');
}

/**
 * A spoiler reads as `[spoiler]` here rather than its contents: this line
 * shows up above a reply and in notices, and nothing should un-hide a
 * spoiler just by being near it in the UI.
 */
function partToPlainLine(part: ContentPart, members: Member[]): string {
  if (part.kind === 'spoiler') return '[spoiler]';
  return partToDraft(part, members);
}

/** Stored text as one plain line, for the snippet above a reply. */
export function toPlainLine(content: string, members: Member[]): string {
  return splitContent(content)
    .map((part) => partToPlainLine(part, members))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The @word being typed just before the caret, if there is one. */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@]{0,32})$/.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - (match[2]?.length ?? 0) - 1, query: (match[2] ?? '').toLowerCase() };
}

/**
 * The half-typed `:name` just before the caret, if there is one.
 *
 * Two letters at least, so a colon in ordinary prose does not open a list, and
 * nothing once the closing colon is typed: by then the text is already a whole
 * `:name:` and there is nothing left to complete.
 */
export function emojiQueryAt(text: string, caret: number): { start: number; query: string } | null {
  // `+` and `-` for `:+1:` and `:-1:`; one character is enough for those.
  const match = /(^|\s):([a-z0-9_+-]{1,32})$/i.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - (match[2]?.length ?? 0) - 1, query: (match[2] ?? '').toLowerCase() };
}
