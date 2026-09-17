/**
 * Mentions, between what a person types and what is stored.
 *
 * A stored message names people by id (`<@id>`), because names change. Nobody
 * should ever see or type that, so the message box works in `@Name` and this
 * file converts in both directions.
 */

import { mentionToken, splitContent } from '@gooffline/shared';
import type { Member } from '@gooffline/shared';

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

/** Stored text back to typed text, for editing a message. */
export function toDraft(content: string, members: Member[]): string {
  return splitContent(content)
    .map((part) => {
      if (part.kind === 'text') return part.text;
      // A link was never rewritten on the way in, so it goes back as it was.
      if (part.kind === 'link') return part.text;
      if (part.kind === 'everyone') return '@everyone';
      const member = members.find((entry) => entry.userId === part.userId);
      return member ? `@${mentionLabel(member, members)}` : '@someone who left';
    })
    .join('');
}

/** Stored text as one plain line, for the snippet above a reply. */
export function toPlainLine(content: string, members: Member[]): string {
  return toDraft(content, members).replace(/\s+/g, ' ').trim();
}

/** The @word being typed just before the caret, if there is one. */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@]{0,32})$/.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - (match[2]?.length ?? 0) - 1, query: (match[2] ?? '').toLowerCase() };
}
