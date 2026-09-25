/**
 * Token-bucket rate limiter with per-key buckets and automatic expiry.
 * Used for REST routes (per IP + per player) and WS sessions (per seat).
 */

type Bucket = { tokens: number; updatedAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  /** Housekeeping interval — stale buckets are dropped, memory stays flat. */
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
    private readonly sweepMs = 60_000,
  ) {
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepMs);
    this.sweepTimer.unref?.();
  }

  /** @returns remaining ms until a token is available, or 0 when allowed. */
  check(key: string): number {
    const nowMs = this.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updatedAt: nowMs };
      this.buckets.set(key, b);
    } else {
      const elapsed = Math.max(0, nowMs - b.updatedAt) / 1000;
      b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSec);
      b.updatedAt = nowMs;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    const deficit = 1 - b.tokens;
    return Math.ceil((deficit / this.refillPerSec) * 1000);
  }

  /** Takes `n` tokens at once (WS burst accounting). */
  checkMany(key: string, n = 1): number {
    let wait = 0;
    for (let i = 0; i < n; i++) wait = this.check(key);
    return wait;
  }

  private sweep(): void {
    const nowMs = this.now();
    const stale = (this.capacity / this.refillPerSec + 10) * 1000;
    for (const [key, b] of this.buckets) {
      if (nowMs - b.updatedAt > stale) this.buckets.delete(key);
    }
  }

  close(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }
}
