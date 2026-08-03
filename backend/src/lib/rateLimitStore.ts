export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}

type Entry = { count: number; resetAt: number };

/**
 * Single-process store. See docs/adr/0004-no-redis-phase-1.md — swap this for a
 * Redis-backed implementation when a second API instance appears, the app moves
 * to serverless, or email sending becomes a queue.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, Entry>();

  constructor(sweepIntervalMs = 60_000) {
    // unref() so the interval cannot keep the process alive after tests finish.
    setInterval(() => this.sweep(), sweepIntervalMs).unref();
  }

  async increment(key: string, windowMs: number): Promise<Entry> {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (!existing || existing.resetAt <= now) {
      const fresh: Entry = { count: 1, resetAt: now + windowMs };
      this.entries.set(key, fresh);
      return fresh;
    }

    existing.count += 1;
    return existing;
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Test hook: drop every window. Cheap, and meaningless in production. */
  clear(): void {
    this.entries.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}

export const defaultRateLimitStore = new InMemoryRateLimitStore();
