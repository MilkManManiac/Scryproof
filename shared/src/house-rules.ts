/*
 * House rules: words this table does not say.
 *
 * An inside joke (Wes, 2026-09-22): anyone who types "bigballer", in any
 * of its spellings, posts "I'm an idiot" instead. It is applied by the
 * sender's own client at the moment of sending or editing, so it holds in
 * a channel and inside an encrypted DM alike, and the server never has to
 * read anything to enforce it.
 */

/** "big baller", "bigballa", "BigBallah", "big-ballerz"... one rule, any case, spaces or not. */
const BIGBALLER = /\bbig[\s_-]*ball(?:er|a|ah)s?\b/gi;

export const HOUSE_RULES: readonly { readonly pattern: RegExp; readonly say: string }[] = [
  { pattern: BIGBALLER, say: "I'm an idiot" },
];

/** The text as the table will hear it. Returns the same string when nothing applies. */
export function houseRules(text: string): string {
  let out = text;
  for (const rule of HOUSE_RULES) out = out.replace(rule.pattern, rule.say);
  return out;
}
