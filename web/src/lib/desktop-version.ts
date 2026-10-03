const versionParts = (value: unknown): [number, number, number] | null => {
  const match = typeof value === 'string' ? /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/.exec(value) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/** Compare numeric release versions; old shells may not report their version. */
export function newerDesktopRelease(latest: unknown, installed: unknown): boolean {
  const next = versionParts(latest);
  if (!next) return false;
  if (installed === undefined) return true;
  const current = versionParts(installed);
  if (!current) return false;
  for (const i of [0, 1, 2] as const) {
    if (next[i] !== current[i]) return next[i] > current[i];
  }
  return false;
}
