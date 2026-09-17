/**
 * Matching a typed fragment against a channel name.
 *
 * Letters in order, not a substring: "spl" finds "session-planning". A letter
 * that lands at the start of a word counts for more, which is what makes the
 * obvious answer come first without a ranking library.
 *
 * Runs entirely in memory against the channels the client already holds. No
 * keystroke leaves the machine to answer a search.
 */

/** Null when the letters are not all there, in order. Higher is a better match. */
export function fuzzyScore(name: string, query: string): number | null {
  if (query === '') return 0;

  let score = 0;
  let at = 0;
  for (const letter of query) {
    const found = name.indexOf(letter, at);
    if (found === -1) return null;
    if (found === 0) score += 3;
    else if ('- _/'.includes(name[found - 1] ?? '')) score += 2;
    else if (found === at) score += 1;
    at = found + 1;
  }
  // Of two names with the same letters, the shorter one is the better answer.
  return score * 100 - name.length;
}
