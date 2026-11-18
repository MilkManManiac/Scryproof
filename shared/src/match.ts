/**
 * The forgiving name matcher the picture games share (Conveyor, Unzoom).
 * One function, used by the app for instant feedback and by the server for
 * the score that counts, so the two can never disagree.
 *
 * Case, accents, spaces, hyphens, punctuation, a leading "a"/"the" and a
 * trailing "s" do not count. A name of five letters or more forgives one
 * wrong, missing or extra letter.
 */

/** "The Hot-Dogs" -> "hotdogs". */
export function plainName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** A name as written and without its trailing "s": "jeans" is also "jean". */
export function nameForms(text: string): string[] {
  const plain = plainName(text);
  return plain.length >= 4 && plain.endsWith('s') ? [plain, plain.slice(0, -1)] : [plain];
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length]!;
}

/** Whether what someone typed names a thing called any of `names`. */
export function namesMatch(said: string, names: readonly string[]): boolean {
  const typed = nameForms(said);
  if (!typed[0]) return false;
  return names.some((name) => {
    const wanted = nameForms(name);
    if (typed.some((form) => wanted.includes(form))) return true;
    return wanted[0]!.length >= 5 && typed.some((form) => wanted.some((want) => distance(form, want) <= 1));
  });
}
