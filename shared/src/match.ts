/**
 * The forgiving name matcher the picture games share (Conveyor, Unzoom).
 * One function, used by the app for instant feedback and by the server for
 * the score that counts, so the two can never disagree.
 *
 * Case, accents, spaces, hyphens, punctuation, a leading "a"/"the" and a
 * trailing "s" do not count. A name of five letters or more forgives one
 * wrong, missing or extra letter.
 */

/** "The Hot-Dogs" -> "hotdog". */
export function plainName(text: string): string {
  const flat = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
  return flat.length >= 4 && flat.endsWith('s') ? flat.slice(0, -1) : flat;
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
  const plain = plainName(said);
  if (!plain) return false;
  return names.some((name) => {
    const want = plainName(name);
    if (plain === want) return true;
    return want.length >= 5 && distance(plain, want) <= 1;
  });
}

/** Exactly the same once case, spaces and the rest are ignored: no slip allowed. */
export function namesSame(said: string, names: readonly string[]): boolean {
  const plain = plainName(said);
  return plain !== '' && names.some((name) => plainName(name) === plain);
}
