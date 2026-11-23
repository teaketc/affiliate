export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterMs: number;
}

export interface RateLimiter {
	consume(key: string): RateLimitResult;
}

/**
 * In-memory sliding-window limiter. Suitable for a single API instance; for
 * horizontal scaling implement RateLimiter on top of Redis (see README).
 */
export class MemoryRateLimiter implements RateLimiter {
	private readonly hits = new Map<string, number[]>();
	private lastSweep = 0;

	constructor(
		private readonly max: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now
	) {}

	consume(key: string): RateLimitResult {
		const now = this.now();
		this.sweep(now);
		const windowStart = now - this.windowMs;
		const timestamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
		if (timestamps.length >= this.max) {
			this.hits.set(key, timestamps);
			const oldest = timestamps[0] ?? now;
			return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + this.windowMs - now) };
		}
		timestamps.push(now);
		this.hits.set(key, timestamps);
		return { allowed: true, remaining: this.max - timestamps.length, retryAfterMs: 0 };
	}

	private sweep(now: number): void {
		if (now - this.lastSweep < this.windowMs) return;
		this.lastSweep = now;
		const windowStart = now - this.windowMs;
		for (const [key, ts] of this.hits) {
			if (!ts.some((t) => t > windowStart)) this.hits.delete(key);
		}
	}
}
