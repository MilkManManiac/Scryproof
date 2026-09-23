/**
 * Emoji by name, in the message box, and every emoji for the picker.
 *
 * `:+1:` and `:fire:` in a draft become the emoji before sending, so what
 * goes over the wire and into the history is the character itself, the same
 * as if it had been pasted. The hand-picked names in `shortcodes.ts` (GitHub's,
 * mostly) are the ones people type, and they are what the list under the
 * message box offers. Every other emoji has a name too, made from Unicode's
 * (`grinning_face`), which the picker shows and which also expands when typed.
 * A hand-picked name always wins over a made-up one. A server's own emoji keep
 * their `:name:` form, because that is how a custom emoji is stored, and they
 * are matched first so a server can shadow a name here with its own picture.
 *
 * lamp, 2026-09-22: "using :+1: and stuff like that would be nice to work too".
 * Wes, 2026-09-23: "Most people don't want to just type to find one."
 */

import { EMOJI_GROUPS } from './emoji-data';
import { SHORTCODES } from './shortcodes';

export { SHORTCODES };

const NAME_RE = /(^|\s):([a-z0-9_+-]{1,32}):/g;

/** Every `:name:` that is a known emoji becomes the emoji. Unknown names stay. */
export function expandShortcodes(text: string, keep: (name: string) => boolean = () => false): string {
  return text.replace(NAME_RE, (whole, before: string, name: string) => {
    if (keep(name)) return whole;
    const emoji = emojiByName(name);
    return emoji ? `${before}${emoji}` : whole;
  });
}

export interface EmojiOffer {
  name: string;
  emoji: string;
}

/** Names matching what was typed after the colon, best first, at most `limit`. */
export function emojiOffers(query: string, limit = 7): EmojiOffer[] {
  if (!query) return [];
  const seen = new Set<string>();
  return Object.entries(SHORTCODES)
    .filter(([name]) => name.includes(query))
    .sort((a, b) => Number(b[0].startsWith(query)) - Number(a[0].startsWith(query)) || a[0].length - b[0].length)
    .filter(([, emoji]) => (seen.has(emoji) ? false : (seen.add(emoji), true)))
    .slice(0, limit)
    .map(([name, emoji]) => ({ name, emoji }));
}

function normalizeEmojiName(name: string): string {
  return name.toLowerCase().replace(/[_\s]+/g, ' ').trim();
}

/**
 * How well `name` matches the picker's search box: `0` when the name starts
 * with what was typed, `1` when it merely contains it somewhere, `null` when
 * it does not match at all. Underscores and spaces are treated alike, so
 * "pregnant man" matches `pregnant_man`. Used for both `SHORTCODES` and a
 * server's own emoji, so the two are ranked the same way.
 */
export function emojiSearchScore(name: string, query: string): 0 | 1 | null {
  const q = normalizeEmojiName(query);
  if (!q) return null;
  const n = normalizeEmojiName(name);
  if (!n.includes(q)) return null;
  return n.startsWith(q) ? 0 : 1;
}

/**
 * Every `SHORTCODES` entry whose name contains `query`, best matches first
 * (starts with the text, then merely contains it), capped at `limit`. Empty
 * query gives nothing back, same as `emojiOffers`.
 */
export function searchShortcodes(query: string, limit = 48): EmojiOffer[] {
  return Object.entries(SHORTCODES)
    .map(([name, emoji]) => ({ name, emoji, score: emojiSearchScore(name, query) }))
    .filter((entry): entry is { name: string; emoji: string; score: 0 | 1 } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, emoji }) => ({ name, emoji }));
}

/** One standard emoji, as the picker shows it. */
export interface CatalogEmoji {
  emoji: string;
  /** The name the footer shows: the hand-picked one if there is one. */
  name: string;
  /** Every name it answers to, `name` first. */
  names: readonly string[];
  /** Unicode's name, "grinning face". */
  label: string;
  /** Light to dark, when the emoji comes in all five skin tones. */
  tones?: readonly string[];
  /** Names and Unicode's name, normalized, for search. */
  words: readonly string[];
  /** Unicode's subgroup ("face-smiling", "animal-mammal"), as loose keywords. */
  keywords: string;
}

export interface CatalogGroup {
  id: string;
  label: string;
  emoji: readonly CatalogEmoji[];
}

let catalog: readonly CatalogGroup[] | null = null;
let names: Map<string, string> | null = null;

/**
 * Every standard emoji, grouped. Unpacked from the generated data the first
 * time it is asked for, not at import, so a page that never opens a picker
 * or types a `:name:` pays nothing for it.
 */
export function emojiCatalog(): readonly CatalogGroup[] {
  catalog ??= EMOJI_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    emoji: group.rows.map(([emoji, nameList, label, subgroup, tones]) => {
      const all = nameList.split(' ');
      return {
        emoji,
        name: all[0]!,
        names: all,
        label,
        tones: tones ? tones.split(' ') : undefined,
        words: [...all, label].map((word) => normalizeEmojiName(word.replace(/[:,]/g, ' '))),
        keywords: (group.subgroups[subgroup] ?? '').replace(/-/g, ' '),
      };
    }),
  }));
  return catalog;
}

/** The emoji a `:name:` stands for: a hand-picked name first, then Unicode's. */
export function emojiByName(name: string): string | undefined {
  const picked = SHORTCODES[name];
  if (picked) return picked;
  if (!names) {
    names = new Map();
    for (const group of emojiCatalog()) {
      for (const entry of group.emoji) {
        for (const each of entry.names) if (!names.has(each)) names.set(each, entry.emoji);
      }
    }
  }
  return names.get(name);
}

/**
 * The skin tone the picker is set to: 0 is the default yellow, 1 to 5 light
 * to dark. An emoji without tones ignores it.
 */
export type SkinTone = 0 | 1 | 2 | 3 | 4 | 5;

export function withTone(entry: CatalogEmoji, tone: SkinTone): string {
  return (tone > 0 && entry.tones?.[tone - 1]) || entry.emoji;
}

/**
 * How well one emoji matches the search box, lower is better: `0` a name
 * starts with the text, `1` a word in a name does, `2` a name contains it
 * somewhere, `3` only its Unicode subgroup matches ("mammal" finds the
 * animals). `null` for no match.
 */
export function catalogSearchScore(entry: CatalogEmoji, query: string): 0 | 1 | 2 | 3 | null {
  const q = normalizeEmojiName(query);
  if (!q) return null;
  let best: 0 | 1 | 2 | 3 | null = null;
  for (const word of entry.words) {
    if (word.startsWith(q)) return 0;
    if (word.includes(` ${q}`)) best = 1;
    else if (best === null && word.includes(q)) best = 2;
  }
  if (best !== null) return best;
  return ` ${entry.keywords}`.includes(` ${q}`) ? 3 : null;
}

/**
 * Every standard emoji matching `query`, best first, at most `limit`. An
 * emoji named exactly what was typed comes first ("heart" is the red heart,
 * not the heart with an arrow, whose Unicode name also starts with it). Ties
 * go to the shorter name, then to the order Unicode lists them in, which
 * puts the everyday one before its rarer cousins.
 */
export function searchEmoji(query: string, limit = 200): { entry: CatalogEmoji; score: 0 | 1 | 2 | 3 }[] {
  const q = normalizeEmojiName(query);
  const hits: { entry: CatalogEmoji; score: 0 | 1 | 2 | 3; exact: number; order: number }[] = [];
  let order = 0;
  for (const group of emojiCatalog()) {
    for (const entry of group.emoji) {
      const score = catalogSearchScore(entry, query);
      if (score !== null) hits.push({ entry, score, exact: entry.words.includes(q) ? 0 : 1, order });
      order += 1;
    }
  }
  return hits
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.exact - b.exact ||
        a.entry.name.length - b.entry.name.length ||
        a.order - b.order,
    )
    .slice(0, limit)
    .map(({ entry, score }) => ({ entry, score }));
}
