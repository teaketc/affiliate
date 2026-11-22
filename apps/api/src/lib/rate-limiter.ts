import type { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSec: number;
}

export interface RateLimiter {
  /** Fixed-window counter: at most `limit` hits per `windowSec` for `key`. */
  hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult>;
}

// INCR + EXPIRE atomically; returns [count, ttl]
const LUA_HIT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {c, ttl}
`;

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const res = (await this.redis.eval(LUA_HIT, 1, `rl:${key}`, String(windowSec))) as [number, number];
    const [count, ttl] = res;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetSec: ttl > 0 ? ttl : windowSec };
  }
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; reset: number }>();
  async hit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const now = Date.now();
    let w = this.windows.get(key);
    if (!w || w.reset <= now) {
      w = { count: 0, reset: now + windowSec * 1000 };
      this.windows.set(key, w);
    }
    w.count += 1;
    return {
      allowed: w.count <= limit,
      remaining: Math.max(0, limit - w.count),
      resetSec: Math.ceil((w.reset - now) / 1000)
    };
  }
}

/**
 * Outbound throttle for marketplace APIs, shared across all API + worker processes via Redis.
 * Waits (instead of failing) until a slot in the current 1-second window is free.
 */
export class ProviderThrottle {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => Bun.sleep(ms)
  ) {}

  async acquire(provider: string, perSecond: number, maxWaitMs = 30_000): Promise<void> {
    const started = Date.now();
    for (;;) {
      const second = Math.floor(Date.now() / 1000);
      const r = await this.limiter.hit(`provider:${provider}:${second}`, perSecond, 2);
      if (r.allowed) return;
      if (Date.now() - started > maxWaitMs) throw new Error(`Throttle wait exceeded for ${provider}`);
      await this.sleep(1000 - (Date.now() % 1000) + 5);
    }
  }
}
