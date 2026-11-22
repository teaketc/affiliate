import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { loadEnv } from '../../src/config/env';
import { MemoryCache } from '../../src/lib/cache';
import { SecretBox, generateApiKey, randomCode, sha256Hex } from '../../src/lib/crypto';
import { MemoryRateLimiter, ProviderThrottle } from '../../src/lib/rate-limiter';
import { validateEndpoint } from '../../src/modules/accounts/account.module';
import { assertMarketplaceUrl } from '../../src/modules/affiliate/affiliate.service';
import { assertAllowed } from '../../src/modules/auth/auth.service';
import { isValidCron } from '../../src/modules/settings/settings.module';
import { localDate, rate, str } from '../../src/providers/util';

const key = randomBytes(32).toString('base64');

describe('SecretBox', () => {
  test('round-trips and produces different ciphertexts', () => {
    const box = new SecretBox(key);
    const a = box.encryptJson({ appId: '1', secret: 's' });
    const b = box.encryptJson({ appId: '1', secret: 's' });
    expect(a).not.toBe(b);
    expect(box.decryptJson(a)).toEqual({ appId: '1', secret: 's' });
  });
  test('tampering is detected', () => {
    const box = new SecretBox(key);
    const parts = box.encrypt('hello').split(':');
    parts[3] = Buffer.from('jello').toString('base64');
    expect(() => box.decrypt(parts.join(':'))).toThrow();
  });
  test('rejects wrong key length', () => {
    expect(() => new SecretBox(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

describe('crypto helpers', () => {
  test('api key format and hash', () => {
    const k = generateApiKey();
    expect(k.key.startsWith('ak_live_')).toBe(true);
    expect(k.prefix).toBe(k.key.slice(0, 16));
    expect(k.hash).toBe(sha256Hex(k.key));
  });
  test('randomCode alphabet/length', () => {
    for (let i = 0; i < 50; i++) expect(randomCode(8)).toMatch(/^[A-Za-z2-9]{8}$/);
  });
});

describe('env', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32), CREDENTIALS_ENCRYPTION_KEY: key, CLICK_IP_SALT: 's'.repeat(16) };
  test('applies defaults and coerces numbers/booleans', () => {
    const e = loadEnv({ ...base, PORT: '8080', SWAGGER_ENABLED: 'false' });
    expect(e.PORT).toBe(8080);
    expect(e.SWAGGER_ENABLED).toBe(false);
    expect(e.REDIS_URL).toBe('redis://localhost:6379');
  });
  test('rejects short secrets', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});

describe('rate limiting', () => {
  test('fixed window', async () => {
    const rl = new MemoryRateLimiter();
    expect((await rl.hit('k', 2, 60)).allowed).toBe(true);
    expect((await rl.hit('k', 2, 60)).allowed).toBe(true);
    const third = await rl.hit('k', 2, 60);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });
  test('throttle waits for next window instead of failing', async () => {
    let slept = 0;
    const t = new ProviderThrottle(new MemoryRateLimiter(), async (ms) => {
      slept += ms;
      await Bun.sleep(Math.min(ms, 1100));
    });
    await t.acquire('X', 1);
    await t.acquire('X', 1);
    expect(slept).toBeGreaterThan(0);
  });
});

describe('cache', () => {
  test('wrap + version bump', async () => {
    const c = new MemoryCache();
    let calls = 0;
    const fn = async () => ++calls;
    expect(await c.wrap('a', 60, fn)).toBe(1);
    expect(await c.wrap('a', 60, fn)).toBe(1);
    await c.bump('ns');
    expect(await c.version('ns')).toBe(1);
  });
});

describe('RBAC', () => {
  const user = (role: 'VIEWER' | 'EDITOR' | 'ADMIN' | 'SUPER_ADMIN') => ({ kind: 'user' as const, userId: 'u', email: 'e', role });
  const keyP = { kind: 'apiKey' as const, apiKeyId: 'k', userId: 'u', scopes: ['products:read' as const], rateLimitPerMin: 10 };
  test('role hierarchy', () => {
    expect(() => assertAllowed(user('ADMIN'), { role: 'EDITOR' })).not.toThrow();
    expect(() => assertAllowed(user('VIEWER'), { role: 'EDITOR' })).toThrow();
  });
  test('api keys need a matching scope and never reach admin-only routes', () => {
    expect(() => assertAllowed(keyP, { role: 'VIEWER', scope: 'products:read' })).not.toThrow();
    expect(() => assertAllowed(keyP, { role: 'VIEWER', scope: 'affiliate:write' })).toThrow();
    expect(() => assertAllowed(keyP, { role: 'VIEWER' })).toThrow();
  });
});

describe('validation helpers', () => {
  test('SSRF guard on account endpoints', () => {
    expect(() => validateEndpoint('LAZADA', 'https://api.lazada.co.th/rest')).not.toThrow();
    expect(() => validateEndpoint('SHOPEE', 'https://open-api.affiliate.shopee.co.th/graphql')).not.toThrow();
    expect(() => validateEndpoint('LAZADA', 'https://evil.example.com/rest')).toThrow();
    expect(() => validateEndpoint('SHOPEE', 'http://open-api.affiliate.shopee.co.th/graphql')).toThrow();
    expect(() => validateEndpoint('LAZADA', 'https://api.lazada.co.th.evil.com/rest')).toThrow();
  });
  test('origin URL must match marketplace', () => {
    expect(() => assertMarketplaceUrl('SHOPEE', 'https://shopee.co.th/product/1/2')).not.toThrow();
    expect(() => assertMarketplaceUrl('LAZADA', 'https://www.lazada.co.th/products/i1.html')).not.toThrow();
    expect(() => assertMarketplaceUrl('SHOPEE', 'https://www.lazada.co.th/x')).toThrow();
    expect(() => assertMarketplaceUrl('SHOPEE', 'https://shopee.co.th.attacker.io/x')).toThrow();
  });
  test('cron validator', () => {
    expect(isValidCron('0 */6 * * *')).toBe(true);
    expect(isValidCron('5,35 1-5 * * 1')).toBe(true);
    expect(isValidCron('every 5 minutes')).toBe(false);
  });
  test('provider parsing utils', () => {
    expect(str('null ')).toBeNull();
    expect(rate('24.1% ')).toBeCloseTo(0.241);
    expect(rate('0.1')).toBe(0.1);
    expect(localDate('1970-01-01 07:00:00', '+07:00')).toBeNull();
  });
});
