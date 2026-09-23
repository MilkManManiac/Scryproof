/**
 * Slash commands.
 *
 * Two kinds. A **spawn** command (`/tang-jump`) is sent as its own text and
 * every client that sees the message arrive draws the character jumping
 * across the room; the message stays in the history as a small line with
 * the character's face, and clicking it plays it again. The server never
 * knows: it is a plain message whose text happens to be a command, which
 * also means it works the same inside an encrypted DM. A **text** command
 * (`/shrug`) is replaced in the box before sending and is never seen by
 * anyone else. `/roll` is neither: the server rolls it (see `shared/dice`).
 * `/init` is the odd one out: see `isInitCommand`.
 *
 * The characters are Wes's own, from his Meepo auto-battler; the sheets in
 * `web/public/meepo/` are made by `scripts/meepo-sheets.py`. Wes,
 * 2026-09-22: "do a /Tang-jump and the character jumps across the screen".
 */

export interface Character {
  /** What is typed: `/<id>-jump`. Also the sheet's file name. */
  id: string;
  /** The name as the game spells it. */
  name: string;
  /** Square frames, side by side, left to right. */
  frames: number;
}

export const CHARACTERS: readonly Character[] = [
  { id: 'assland', name: 'Assland', frames: 5 },
  { id: 'beep-boop', name: 'beep-boop', frames: 5 },
  { id: 'blackjack', name: 'BlackJack', frames: 5 },
  { id: 'esmeralda', name: 'Esmeralda', frames: 5 },
  { id: 'finn', name: 'Finn', frames: 5 },
  { id: 'forg', name: 'Forg', frames: 5 },
  { id: 'geezer', name: 'Geezer', frames: 5 },
  { id: 'girafft', name: 'Girafft', frames: 5 },
  { id: 'ham', name: 'Ham', frames: 5 },
  { id: 'humphrey', name: 'Humphrey', frames: 5 },
  { id: 'loaf', name: 'Loaf', frames: 5 },
  { id: 'moo-man', name: 'moo-man', frames: 5 },
  { id: 'murder', name: 'Murder', frames: 5 },
  { id: 'nary', name: 'Nary', frames: 5 },
  { id: 'oswald', name: 'Oswald', frames: 5 },
  { id: 'pang', name: 'pang', frames: 5 },
  { id: 'piggy', name: 'Piggy', frames: 5 },
  { id: 'pooty', name: 'Pooty', frames: 5 },
  { id: 'quatack', name: 'Quatack', frames: 5 },
  { id: 'sarah', name: 'Sarah', frames: 5 },
  { id: 'sir-pokesalot', name: 'Sir-Pokesalot', frames: 5 },
  { id: 'stranger', name: 'Stranger', frames: 5 },
  { id: 'tang', name: 'Tang', frames: 5 },
  { id: 'thomas', name: 'Thomas', frames: 5 },
  { id: 'twigman', name: 'TwigMan', frames: 5 },
  { id: 'wilber', name: 'Wilber', frames: 5 },
  { id: 'wyatt', name: 'Wyatt', frames: 5 },
];

/** The sheet for a character: frames of `FRAME` pixels, in a row. */
export const FRAME = 128;
export const sheetUrl = (id: string): string => `/meepo/${id}.png`;

export const characterById = (id: string): Character | undefined =>
  CHARACTERS.find((character) => character.id === id);

export const spawnCommand = (character: Character): string => `/${character.id}-jump`;

/** The commands that are just text with a shorter name. */
export const TEXT_COMMANDS: readonly { name: string; text: string; note: string }[] = [
  { name: 'shrug', text: '¯\\_(ツ)_/¯', note: '¯\\_(ツ)_/¯' },
  { name: 'tableflip', text: '(╯°□°)╯︵ ┻━┻', note: '(╯°□°)╯︵ ┻━┻' },
  { name: 'unflip', text: '┬─┬ノ( º _ ºノ)', note: '┬─┬ノ( º _ ºノ)' },
];

/**
 * `/init`, exactly. The one command the client acts on rather than sends:
 * it never becomes a message. The composer calls the start route instead,
 * and the server posts "Initiative started." itself, so the history still
 * shows the fight began. Every other command here is either sent as typed
 * (a spawn, `/roll`, `/poll`) or rewritten into text before sending.
 */
export function isInitCommand(content: string): boolean {
  return /^\/init$/i.test(content.trim());
}

/** A message that is a spawn command, or null. Exact: no other words. */
export function spawnOf(content: string | null | undefined): Character | null {
  if (!content) return null;
  const match = /^\/([a-z0-9-]+)-jump$/i.exec(content.trim());
  if (!match) return null;
  return characterById((match[1] ?? '').toLowerCase()) ?? null;
}

/**
 * What the box should send in place of what was typed: a text command
 * becomes its text, with anything after it kept. Everything else is
 * returned as it was.
 */
export function expandTextCommand(body: string): string {
  const match = /^\/([a-z]+)(\s+[\s\S]*)?$/i.exec(body);
  if (!match) return body;
  const command = TEXT_COMMANDS.find((entry) => entry.name === (match[1] ?? '').toLowerCase());
  if (!command) return body;
  return `${command.text}${match[2] ?? ''}`;
}

export interface CommandOffer {
  key: string;
  /** What lands in the box when picked. */
  written: string;
  name: string;
  note: string;
  /** A character's sheet, for the row to show its face. */
  sheet?: string;
}

/**
 * The list under the box while a `/word` is being typed at the start.
 * Returns null when nothing command-shaped is there, and an empty list when
 * something is but nothing matches, so the box can tell the two apart.
 */
export function commandQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const head = text.slice(0, caret);
  const match = /^\/([a-z0-9-]*)$/i.exec(head);
  if (!match) return null;
  return { start: 0, query: (match[1] ?? '').toLowerCase() };
}

export function commandOffers(query: string, limit = 7): CommandOffer[] {
  const all: CommandOffer[] = [
    ...CHARACTERS.map((character) => ({
      key: `spawn:${character.id}`,
      written: spawnCommand(character),
      name: spawnCommand(character),
      note: `${character.name} jumps across the room`,
      sheet: sheetUrl(character.id),
    })),
    { key: 'roll', written: '/roll', name: '/roll 2d6+3', note: 'roll dice, everyone sees the result' },
    {
      key: 'poll',
      written: '/poll',
      name: '/poll',
      note: 'ask the room: /poll Which night? | Friday | Saturday',
    },
    { key: 'init', written: '/init', name: '/init', note: 'start an initiative tracker for this channel' },
    ...TEXT_COMMANDS.map((command) => ({
      key: `text:${command.name}`,
      written: `/${command.name}`,
      name: `/${command.name}`,
      note: command.note,
    })),
  ];
  const wanted = query.replace(/^\//, '');
  return all
    .filter((offer) => offer.written.slice(1).includes(wanted))
    .sort((a, b) => Number(b.written.slice(1).startsWith(wanted)) - Number(a.written.slice(1).startsWith(wanted)))
    .slice(0, limit);
}
