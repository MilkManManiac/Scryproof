/*
 * House rules: words this table does not say.
 *
 * An inside joke (Wes, 2026-09-22): anyone who types "bigballer", in any
 * of its spellings, posts "I'm an idiot" instead. It is applied by the
 * sender's own client at the moment of sending or editing, so it holds in
 * a channel and inside an encrypted DM alike, and again by the server on
 * anything it can read (channel text, names), for an old client or someone
 * poking at the API by hand.
 *
 * Wes, 2026-09-23: "Make it practically impossible to type bigballer, big
 * baller of any variety." A regex over the text as typed loses to
 * "b i g b a l l e r", "b1gb4ll3r", "bíg bállér" or a Cyrillic "а". So the
 * text is first read the way a person reads it: accents off, lookalike
 * letters and digits turned into the letter they stand for, anything that
 * is not a letter dropped, and a letter held down ("baaaaller") counted
 * once. The rule is matched against that reading, and the matching stretch
 * of the original text is what gets replaced.
 */

const SAY = "I'm an idiot";

/**
 * What a character reads as, when it stands in for one of the letters the
 * rule cares about. `i` and `l` are one letter here: `1`, `|`, `!` and a
 * capital I pass for either, and "blg" and "bil" are not words anyone means.
 */
const LOOKALIKE: Record<string, string> = {
  // digits and symbols
  '8': 'b', '6': 'g', '9': 'g', '4': 'a', '@': 'a', '3': 'e', '€': 'e', '1': 'l', '|': 'l', '!': 'l', '7': 'l',
  '0': 'o', '$': 's', '5': 's', '2': 'z',
  // Latin letters that are not in NFD's reach, and the i/l merge
  i: 'l', ı: 'l', ł: 'l', ß: 'b', ƀ: 'b', ǥ: 'g', ɡ: 'g', ɢ: 'g', ʀ: 'r', ɾ: 'r', ʙ: 'b', ʟ: 'l', ɪ: 'l', æ: 'a',
  // Cyrillic
  а: 'a', в: 'b', ь: 'b', ъ: 'b', б: 'b', е: 'e', ё: 'e', є: 'e', э: 'e', г: 'r', і: 'l', ї: 'l', ӏ: 'l', л: 'l',
  о: 'o', р: 'r', я: 'r', ѕ: 's', ԍ: 'g', һ: 'h', н: 'h', у: 'u', и: 'u',
  // Greek
  α: 'a', β: 'b', ε: 'e', ι: 'l', ο: 'o', ρ: 'r', γ: 'r', η: 'h', υ: 'u',
};

/** One character of the original, as read: a letter or nothing. */
function readAs(char: string): string {
  let c = char.normalize('NFKC').toLowerCase();
  // Accents off: é to e, á to a. What is left of a combining mark is nothing.
  c = c.normalize('NFD').replace(/\p{M}/gu, '');
  if (c.length !== 1) return c.length === 0 ? '' : readAs(c[0]!);
  const look = LOOKALIKE[c];
  if (look) return look;
  return /[a-z]/.test(c) ? c : '';
}

/**
 * The rule, over the reading. "big" then "bal" then an ending that makes it
 * a person and not a ball: baller, balla, ballah, ballar, ballr, and plurals.
 * Repeated letters are already one, so "ll" reads as "l".
 */
const RULE = /blgbal(?:er|eh|a[rh]?|r|h)[sz]?/g;
const BIG_BAL = 6;

/**
 * Stretches of text the rule must not reach into: a mention token (`<@id>`,
 * the only bracketed token this app has; the id is hex that could spell
 * anything once read) and links. Anything else in angle brackets is just
 * text with brackets round it.
 */
const UNTOUCHABLE = /<@[0-9a-f-]{36}>|https?:\/\/\S+/gi;

/** Replaces the joke in one stretch of free text. */
function applyTo(text: string): string {
  const chars = Array.from(text);
  // The reading, one letter per kept character, with where each came from.
  let reading = '';
  const from: number[] = [];
  const to: number[] = [];
  chars.forEach((char, index) => {
    const letter = readAs(char);
    if (!letter) return;
    if (reading.endsWith(letter)) {
      to[to.length - 1] = index; // held down: the same letter again widens it
      return;
    }
    reading += letter;
    from.push(index);
    to.push(index);
  });

  // Whether there is a space between two letters of the reading.
  const spaced = (k: number) => /\s/.test(chars.slice(to[k]! + 1, from[k + 1]!).join(''));

  const cuts: { start: number; end: number }[] = [];
  for (const match of reading.matchAll(RULE)) {
    const first = match.index;
    const last = first + match[0].length - 1;
    // "a big ball of fire" and "a big ball and a chain" are the table talking
    // about a ball. The ending counts when it is part of the word "ball"
    // (baller, ball-er), or when the whole word was spelled out spaced
    // (b a l l e r), not when it is the start of the next word.
    const endingAlone = spaced(first + BIG_BAL - 1);
    const ballSpaced = spaced(first + 3) && spaced(first + 4);
    if (endingAlone && !ballSpaced) continue;
    // "a big balance", "the big ballet", "big ballroom", "Big Bailey": the
    // reading goes on without a break, so it is a longer word, not the joke.
    // Only a real letter carries a word on ("baller!" and "baller1" end it,
    // whatever the ! and the 1 read as), and not one that starts the joke again.
    const next = last + 1;
    const carriesOn = next < reading.length && !spaced(last) && /\p{L}/u.test(chars[from[next]!]!);
    if (carriesOn && !reading.startsWith('blgbal', next)) continue;
    cuts.push({ start: from[first]!, end: to[last]! });
  }
  if (cuts.length === 0) return text;

  let out = '';
  let at = 0;
  for (const cut of cuts) {
    out += chars.slice(at, cut.start).join('') + SAY;
    at = cut.end + 1;
  }
  return out + chars.slice(at).join('');
}

/** The text as the table will hear it. Returns the same string when nothing applies. */
export function houseRules(text: string): string {
  let out = '';
  let at = 0;
  for (const token of text.matchAll(UNTOUCHABLE)) {
    out += applyTo(text.slice(at, token.index)) + token[0];
    at = token.index + token[0].length;
  }
  out += applyTo(text.slice(at));
  return out === text ? text : out;
}
