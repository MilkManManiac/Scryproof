/**
 * Makes `web/src/lib/emoji-data.ts`, every emoji the picker shows, from
 * Unicode's `emoji-test.txt`.
 *
 * Run once by hand when a new Unicode emoji version is worth having:
 *
 *   curl -o emoji-test.txt https://unicode.org/Public/emoji/latest/emoji-test.txt
 *   node scripts/emoji-data.mjs emoji-test.txt
 *
 * The app never fetches anything; the output is committed. Only
 * fully-qualified emoji are kept, which is the one spelling of each emoji a
 * keyboard should offer. Skin tone variants are folded into their base emoji
 * (the picker applies the tone you chose) when all five single-tone variants
 * exist; two-tone pairs like a handshake with different hands are left out,
 * because one tone choice cannot pick them.
 *
 * MAX_VERSION leaves out emoji newer than the system fonts people actually
 * have. The picker draws emoji with the system font, and an emoji the font
 * does not know is an empty box. Windows 11's font stops around Emoji 15.1,
 * so that is the cap; raise it when the fonts catch up and run this again.
 *
 * Names: the hand-picked `SHORTCODES` win wherever they name the same emoji,
 * so `:fire:` and `:+1:` are what the footer shows. Every other emoji gets
 * Unicode's name in snake case (`grinning_face`, `flag_japan`). When that
 * name is already a hand-picked name for a different emoji (`cat` is the cat
 * face; Unicode's "cat" is the whole cat) it gets a 2 on the end, as GitHub
 * does (`cat2`).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SHORTCODES } from '../web/src/lib/shortcodes.ts';

const MAX_VERSION = 15.1;
const OUT = fileURLToPath(new URL('../web/src/lib/emoji-data.ts', import.meta.url));

// Unicode's groups, in the order and under the names the picker uses. People
// & Body is folded into Smileys, as Discord does; Component (the bare skin
// tone swatches and hair pieces) is not something anyone picks on its own.
const GROUPS = [
  { id: 'people', label: 'Smileys & People', from: ['Smileys & Emotion', 'People & Body'] },
  { id: 'nature', label: 'Animals & Nature', from: ['Animals & Nature'] },
  { id: 'food', label: 'Food & Drink', from: ['Food & Drink'] },
  { id: 'activities', label: 'Activities', from: ['Activities'] },
  { id: 'travel', label: 'Travel & Places', from: ['Travel & Places'] },
  { id: 'objects', label: 'Objects', from: ['Objects'] },
  { id: 'symbols', label: 'Symbols', from: ['Symbols'] },
  { id: 'flags', label: 'Flags', from: ['Flags'] },
];

const TONES = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'];
const TONE_RE = /(light|medium-light|medium|medium-dark|dark) skin tone/g;

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/emoji-data.mjs path/to/emoji-test.txt');
  process.exit(1);
}
const text = readFileSync(source, 'utf8');
const version = /^# Version: (\S+)/m.exec(text)?.[1];
if (!version) throw new Error('No "# Version:" line; is this emoji-test.txt?');

/** Unicode's name as a `:name:`: plain letters, digits and underscores. */
function snake(label) {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/#/g, ' hash ')
    .replace(/\*/g, ' asterisk ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

let group = '';
let subgroup = '';
const bases = []; // { emoji, label, group, subgroup }
const byLabel = new Map();
const toned = []; // { base label, tone, emoji }

for (const line of text.split('\n')) {
  const heading = /^# (group|subgroup): (.+)$/.exec(line);
  if (heading) {
    if (heading[1] === 'group') group = heading[2].trim();
    else subgroup = heading[2].trim();
    continue;
  }
  const row = /^[0-9A-F ]+;\s*fully-qualified\s*#\s*(\S+)\s+E(\d+\.\d+)\s+(.+)$/.exec(line);
  if (!row) continue;
  const [, emoji, emojiVersion, label] = row;
  if (Number(emojiVersion) > MAX_VERSION) continue;
  if (!GROUPS.some((entry) => entry.from.includes(group))) continue;

  const tones = [...label.matchAll(TONE_RE)];
  if (tones.length > 1) continue;
  if (tones.length === 1) {
    const base = label
      .replace(/: (?:light|medium-light|medium|medium-dark|dark) skin tone$/, '')
      .replace(/: (?:light|medium-light|medium|medium-dark|dark) skin tone, /, ': ')
      .replace(/, (?:light|medium-light|medium|medium-dark|dark) skin tone/, '');
    toned.push({ base, tone: tones[0][1], emoji });
    continue;
  }
  const entry = { emoji, label, group, subgroup };
  bases.push(entry);
  byLabel.set(label, entry);
}

// Tones, where all five exist for the base.
const toneSets = new Map();
for (const { base, tone, emoji } of toned) {
  if (!byLabel.has(base)) continue;
  const set = toneSets.get(base) ?? {};
  set[tone] = emoji;
  toneSets.set(base, set);
}
for (const [base, set] of toneSets) {
  if (TONES.every((tone) => set[tone])) byLabel.get(base).tones = TONES.map((tone) => set[tone]);
}

// Names. Hand-picked ones first, in the order `SHORTCODES` lists them, so the
// first is the one the footer shows.
const taken = new Set(Object.keys(SHORTCODES));
const byEmoji = new Map(bases.map((entry) => [entry.emoji, entry]));
for (const entry of bases) entry.names = [];
const unplaced = [];
for (const [name, emoji] of Object.entries(SHORTCODES)) {
  const entry = byEmoji.get(emoji);
  if (entry) entry.names.push(name);
  else unplaced.push(`${name} ${emoji}`);
}
if (unplaced.length) {
  // A hand-picked name for something that is not a fully-qualified emoji
  // still expands when typed (emoji.ts checks `SHORTCODES` first); it just
  // has no square in the picker. Say so, so it can be fixed on purpose.
  console.warn(`Not in the picker (not fully-qualified or over the cap): ${unplaced.join(', ')}`);
}
for (const entry of bases) {
  let name = snake(entry.label);
  if (entry.names.includes(name)) continue;
  if (taken.has(name)) {
    let n = 2;
    while (taken.has(`${name}${n}`)) n += 1;
    name = `${name}${n}`;
  }
  taken.add(name);
  entry.names.push(name);
}

// Output: per group, the subgroup names once, then one row per emoji:
// [emoji, names, Unicode's name, subgroup index, tones?]. Space-separated
// strings keep the file small; `emoji-catalog.ts` unpacks them.
const out = [];
out.push('/**');
out.push(` * Every emoji the picker shows. Generated by \`scripts/emoji-data.mjs\` from`);
out.push(` * Unicode's emoji-test.txt, version ${version}, emoji up to E${MAX_VERSION}. Do not edit`);
out.push(' * by hand; change the script or `shortcodes.ts` and run it again.');
out.push(' */');
out.push('');
out.push(`export const EMOJI_DATA_VERSION = '${version}';`);
out.push(`export const EMOJI_DATA_MAX = '${MAX_VERSION}';`);
out.push('');
out.push('/** [emoji, names (first is shown), Unicode name, subgroup index, five skin tones or omitted] */');
out.push('export type EmojiRow = readonly [string, string, string, number, string?];');
out.push('');
out.push('export interface EmojiGroupData {');
out.push('  id: string;');
out.push('  label: string;');
out.push('  subgroups: readonly string[];');
out.push('  rows: readonly EmojiRow[];');
out.push('}');
out.push('');
out.push('export const EMOJI_GROUPS: readonly EmojiGroupData[] = [');
let total = 0;
for (const spec of GROUPS) {
  const rows = bases.filter((entry) => spec.from.includes(entry.group));
  const subgroups = [...new Set(rows.map((entry) => entry.subgroup))];
  total += rows.length;
  out.push('  {');
  out.push(`    id: ${JSON.stringify(spec.id)},`);
  out.push(`    label: ${JSON.stringify(spec.label)},`);
  out.push(`    subgroups: ${JSON.stringify(subgroups)},`);
  out.push('    rows: [');
  for (const entry of rows) {
    const row = [entry.emoji, entry.names.join(' '), entry.label, subgroups.indexOf(entry.subgroup)];
    if (entry.tones) row.push(entry.tones.join(' '));
    out.push(`      ${JSON.stringify(row)},`);
  }
  out.push('    ],');
  out.push('  },');
}
out.push('];');
out.push('');
writeFileSync(OUT, out.join('\n'));
console.log(`Emoji ${version}, up to E${MAX_VERSION}: ${total} emoji, ${[...toneSets.values()].filter((set) => TONES.every((tone) => set[tone])).length} with skin tones.`);
