/**
 * In-process rate limiting.
 *
 * A fixed-window counter in memory. Deliberately simple: one box, one process,
 * no Redis to run or secure. If we ever scale past one node this moves to
 * Postgres or Redis, and the call sites do not change.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Evict expired buckets so a long uptime does not grow memory forever. */
let lastSweep = Date.now();
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function consume(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Clear a bucket after a success, so a correct login resets the counter. */
export function reset(key: string): void {
  buckets.delete(key);
}
