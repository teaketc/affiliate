import type { Redis } from 'ioredis';
import type { Logger } from './logger';

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSec: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T>;
  /** Monotonic namespace version, used to invalidate whole list caches in O(1). */
  version(ns: string): Promise<number>;
  bump(ns: string): Promise<void>;
}

/** Redis JSON cache. Cache failures never fail the request — they degrade to a miss. */
export class RedisCache implements Cache {
  constructor(
    private readonly redis: Redis,
    private readonly log: Logger,
    private readonly prefix = 'cache:'
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.redis.get(this.prefix + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (e) {
      this.log.warn({ err: e, key }, 'cache get failed');
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    try {
      await this.redis.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSec);
    } catch (e) {
      this.log.warn({ err: e, key }, 'cache set failed');
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys.map((k) => this.prefix + k));
    } catch (e) {
      this.log.warn({ err: e }, 'cache del failed');
    }
  }

  async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await fn();
    await this.set(key, value, ttlSec);
    return value;
  }

  async version(ns: string): Promise<number> {
    try {
      const v = await this.redis.get(`${this.prefix}v:${ns}`);
      return v === null ? 0 : Number(v);
    } catch {
      return 0;
    }
  }

  async bump(ns: string): Promise<void> {
    try {
      await this.redis.incr(`${this.prefix}v:${ns}`);
    } catch (e) {
      this.log.warn({ err: e, ns }, 'cache bump failed');
    }
  }
}

/** In-memory cache for tests. */
export class MemoryCache implements Cache {
  private readonly store = new Map<string, { value: string; exp: number }>();
  private readonly versions = new Map<string, number>();

  async get<T>(key: string): Promise<T | undefined> {
    const e = this.store.get(key);
    if (!e || e.exp < Date.now()) return undefined;
    return JSON.parse(e.value) as T;
  }
  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    this.store.set(key, { value: JSON.stringify(value), exp: Date.now() + ttlSec * 1000 });
  }
  async del(...keys: string[]): Promise<void> {
    for (const k of keys) this.store.delete(k);
  }
  async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;
    const v = await fn();
    await this.set(key, v, ttlSec);
    return v;
  }
  async version(ns: string): Promise<number> {
    return this.versions.get(ns) ?? 0;
  }
  async bump(ns: string): Promise<void> {
    this.versions.set(ns, (this.versions.get(ns) ?? 0) + 1);
  }
}
