import { expect, test } from 'bun:test';
import { MemoryRateLimiter } from '../../src/security/rate-limit';

test('sliding window allows max requests per window per key', () => {
	let now = 0;
	const rl = new MemoryRateLimiter(2, 1000, () => now);
	expect(rl.consume('a').allowed).toBe(true);
	expect(rl.consume('a').allowed).toBe(true);
	const blocked = rl.consume('a');
	expect(blocked.allowed).toBe(false);
	expect(blocked.retryAfterMs).toBe(1000);
	expect(rl.consume('b').allowed).toBe(true);
	now = 1001;
	expect(rl.consume('a').allowed).toBe(true);
});
