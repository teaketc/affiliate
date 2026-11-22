/**
 * End-to-end test: real PostgreSQL + Redis, real Elysia app, stubbed marketplace HTTP.
 * Runs only when INTEGRATION_DATABASE_URL and INTEGRATION_REDIS_URL are set (see README → Testing).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { createApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { createContainer, type Container } from '../../src/container';
import { LAZADA_FEED_RESPONSE, LAZADA_GETLINK_RESPONSE, jsonResponse } from '../fixtures';

const DB = process.env.INTEGRATION_DATABASE_URL;
const REDIS = process.env.INTEGRATION_REDIS_URL;
const run = DB && REDIS ? describe : describe.skip;

const THAI_ITEM = {
  ...LAZADA_FEED_RESPONSE.result.data[0],
  productId: '2117070236',
  productName: 'กาแฟคั่วบด ดอยช้าง Arabica 250g',
  brandName: 'Doi Chaang',
  discountPrice: '189',
  totalCommissionRate: '0.15',
  mmCampaignId: null,
  dmInviteId: null
};

const marketplaceCalls: string[] = [];
async function fakeMarketplace(input: string | URL | Request): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  marketplaceCalls.push(url);
  if (url.includes('/marketing/product/feed')) {
    return jsonResponse({ ...LAZADA_FEED_RESPONSE, result: { ...LAZADA_FEED_RESPONSE.result, data: [LAZADA_FEED_RESPONSE.result.data[0], THAI_ITEM] } });
  }
  if (url.includes('/marketing/getlink')) return jsonResponse(LAZADA_GETLINK_RESPONSE);
  return new Response('not stubbed', { status: 500 });
}

run('API integration', () => {
  let c: Container;
  let app: ReturnType<typeof createApp>;
  let adminToken = '';
  let accountId = '';
  let productId = '';

  const call = async (method: string, path: string, opts: { token?: string; apiKey?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.apiKey) headers['x-api-key'] = opts.apiKey;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.handle(
      new Request(`http://localhost${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
    );
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json: json as Record<string, unknown> & { data?: Record<string, unknown>[] }, headers: res.headers };
  };

  beforeAll(async () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: DB,
      REDIS_URL: REDIS,
      JWT_SECRET: randomBytes(32).toString('hex'),
      CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      CLICK_IP_SALT: randomBytes(16).toString('hex'),
      PUBLIC_BASE_URL: 'https://go.example.com',
      RATE_LIMIT_PER_MIN: '10000'
    });
    c = createContainer(env, 'test', { providerFetch: fakeMarketplace });
    await c.redis.flushdb();
    await c.prisma.$executeRawUnsafe(
      `TRUNCATE users, api_keys, affiliate_accounts, categories, products, product_images, product_variants, product_categories,
       affiliate_links, campaigns, price_histories, promotions, sync_jobs, click_events, api_logs, system_settings CASCADE`
    );
    await c.prisma.user.createMany({
      data: [
        { email: 'admin@example.com', name: 'Admin', role: 'SUPER_ADMIN', passwordHash: await Bun.password.hash('correct horse battery') },
        { email: 'viewer@example.com', name: 'Viewer', role: 'VIEWER', passwordHash: await Bun.password.hash('viewer password 123') }
      ]
    });
    app = createApp({
      ...c,
      probes: [
        { name: 'postgres', check: async () => void (await c.prisma.$queryRaw`SELECT 1`) },
        { name: 'redis', check: async () => void (await c.redis.ping()) }
      ]
    });
  });

  afterAll(async () => {
    await c?.syncQueue.queue.obliterate({ force: true });
    await c?.close();
  });

  test('health and readiness', async () => {
    expect((await call('GET', '/health')).status).toBe(200);
    const ready = await call('GET', '/ready');
    expect(ready.status).toBe(200);
    expect(ready.json.status).toBe('ready');
  });

  test('unauthenticated requests get the standard error envelope', async () => {
    const r = await call('GET', '/api/v1/products');
    expect(r.status).toBe(401);
    expect(r.json).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect(r.headers.get('x-request-id')).toBeTruthy();
  });

  test('login', async () => {
    expect((await call('POST', '/api/v1/auth/login', { body: { email: 'admin@example.com', password: 'wrong password!' } })).status).toBe(401);
    const ok = await call('POST', '/api/v1/auth/login', { body: { email: 'ADMIN@example.com', password: 'correct horse battery' } });
    expect(ok.status).toBe(200);
    adminToken = String(ok.json.accessToken);
    expect((await call('GET', '/api/v1/auth/me', { token: adminToken })).json.role).toBe('SUPER_ADMIN');
  });

  test('validation errors return 422', async () => {
    const r = await call('POST', '/api/v1/auth/login', { body: { email: 'not-an-email', password: 'x' } });
    expect(r.status).toBe(422);
    expect(r.json).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  test('create Lazada account — credentials never echoed, SSRF guard enforced', async () => {
    const bad = await call('POST', '/api/v1/accounts', {
      token: adminToken,
      body: { marketplace: 'LAZADA', name: 'Evil', region: 'TH', endpoint: 'https://169.254.169.254/rest', credentials: { appKey: 'a', appSecret: 'b', userToken: 'c' } }
    });
    expect(bad.status).toBe(400);

    const r = await call('POST', '/api/v1/accounts', {
      token: adminToken,
      body: { marketplace: 'LAZADA', name: 'Main TH', region: 'TH', endpoint: 'https://api.lazada.co.th/rest', credentials: { appKey: '100000', appSecret: 'super-secret', userToken: 'ut-1' } }
    });
    expect(r.status).toBe(201);
    accountId = String(r.json.id);
    expect(JSON.stringify(r.json)).not.toContain('super-secret');
    const row = await c.prisma.affiliateAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(row.credentialsEnc).not.toContain('super-secret');
  });

  test('manual sync → processor → products, categories, price history', async () => {
    const r = await call('POST', '/api/v1/sync/products', { token: adminToken, body: { accountId, maxPages: 1 } });
    expect(r.status).toBe(202);
    const jobId = String(r.json.id);
    expect((await call('POST', '/api/v1/sync/products', { token: adminToken, body: { accountId } })).status).toBe(409);

    const stats = await c.syncProcessor.run(jobId, 1, false);
    expect(stats).toMatchObject({ fetched: 2, created: 2, failedItems: 0 });
    const signed = new URL(marketplaceCalls.find((u) => u.includes('product/feed')) ?? '');
    expect(signed.searchParams.get('sign')).toMatch(/^[0-9A-F]{64}$/);

    const job = await call('GET', `/api/v1/sync/jobs/${jobId}`, { token: adminToken });
    expect(job.json.status).toBe('SUCCESS');

    // second sync with same prices: no new price history rows
    await c.prisma.syncJob.update({ where: { id: jobId }, data: { status: 'FAILED' } });
    const retry = await call('POST', `/api/v1/sync/jobs/${jobId}/retry`, { token: adminToken });
    expect(retry.status).toBe(202);
    const s2 = await c.syncProcessor.run(String(retry.json.id), 1, false);
    expect(s2).toMatchObject({ updated: 2, priceChanges: 0 });
    expect(await c.prisma.priceHistory.count()).toBe(2);
  });

  test('product list, filters, sorting and full-text search', async () => {
    const all = await call('GET', '/api/v1/products?marketplace=LAZADA&sort=price_asc', { token: adminToken });
    expect(all.status).toBe(200);
    expect(all.json.meta).toMatchObject({ total: 2 });
    expect(all.json.data?.map((p) => p.price)).toEqual(['189.00', '599.20']);

    const commission = await call('GET', '/api/v1/products?minCommission=12', { token: adminToken });
    expect(commission.json.data).toHaveLength(1);

    const price = await call('GET', '/api/v1/products?minPrice=500&maxPrice=700', { token: adminToken });
    expect(price.json.data?.[0]?.name).toBe('test product do not buy9');

    const fts = await call('GET', '/api/v1/products/search?q=arabica', { token: adminToken });
    expect(fts.json.data?.[0]?.name).toContain('Arabica');
    const thai = await call('GET', `/api/v1/products/search?q=${encodeURIComponent('ดอยช้าง')}`, { token: adminToken });
    expect(thai.json.data).toHaveLength(1);
    productId = String(thai.json.data?.[0]?.id);

    expect((await call('GET', '/api/v1/products?minPrice=10&maxPrice=1', { token: adminToken })).status).toBe(400);
  });

  test('product detail, categories, price history, promotions', async () => {
    const d = await call('GET', `/api/v1/products/${productId}`, { token: adminToken });
    expect(d.status).toBe(200);
    expect(d.json.brandName).toBe('Doi Chaang');
    expect((d.json.categories as unknown[]).length).toBe(1);

    const cats = await call('GET', '/api/v1/categories?marketplace=LAZADA', { token: adminToken });
    expect(cats.json as unknown).toEqual([expect.objectContaining({ externalId: '4404', productCount: 2 })]);

    const h = await call('GET', `/api/v1/price-history/${productId}?days=7`, { token: adminToken });
    expect(h.json).toMatchObject({ current: '189.00', lowest: '189.00' });

    const promos = await call('GET', '/api/v1/promotions', { token: adminToken });
    expect(promos.status).toBe(200);

    const unknown = await call('GET', '/api/v1/products/00000000-0000-4000-8000-000000000000', { token: adminToken });
    expect(unknown.status).toBe(404);
  });

  let shortLinkCode = '';
  test('campaign + generate affiliate link + history', async () => {
    const camp = await call('POST', '/api/v1/campaigns', { token: adminToken, body: { accountId, name: 'Coffee Week', code: 'COFFEE1', status: 'ACTIVE' } });
    expect(camp.status).toBe(201);

    const r = await call('POST', '/api/v1/affiliate/generate-link', {
      token: adminToken,
      body: { accountId, productId, campaignId: camp.json.id, subIds: ['facebook'] }
    });
    expect(r.status).toBe(201);
    expect(r.json.shortLink).toBe('https://c.lazada.co.th/t/c.YXZuGj');
    expect(r.json.subIds).toEqual(['COFFEE1', 'facebook']);
    shortLinkCode = String(r.json.trackingUrl).split('/r/')[1] ?? '';
    const getlink = new URL(marketplaceCalls.find((u) => u.includes('getlink')) ?? '');
    expect(getlink.searchParams.get('inputType')).toBe('productId');
    expect(getlink.searchParams.get('subId1')).toBe('COFFEE1');

    const hist = await call('GET', `/api/v1/affiliate/links?accountId=${accountId}`, { token: adminToken });
    expect(hist.json.meta).toMatchObject({ total: 1 });
  });

  test('click tracking redirect', async () => {
    const r = await app.handle(new Request(`http://localhost/r/${shortLinkCode}?utm_source=line`, { headers: { 'user-agent': 'itest' } }));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://c.lazada.co.th/t/c.YXZuGj');
    await Bun.sleep(100);
    const click = await c.prisma.clickEvent.findFirstOrThrow();
    expect(click.ipHash).toHaveLength(64);
    expect(click.subIds).toEqual({ utm_source: 'line' });
    expect((await app.handle(new Request('http://localhost/r/ZZZZZZZZ'))).status).toBe(404);
  });

  test('API keys: scopes enforced, admin routes closed to keys', async () => {
    const k = await call('POST', '/api/v1/api-keys', { token: adminToken, body: { name: 'partner', scopes: ['products:read'] } });
    expect(k.status).toBe(201);
    const key = String(k.json.key);
    expect((await call('GET', '/api/v1/products', { apiKey: key })).status).toBe(200);
    expect((await call('POST', '/api/v1/affiliate/generate-link', { apiKey: key, body: { accountId, productId } })).status).toBe(403);
    expect((await call('GET', '/api/v1/sync/jobs', { apiKey: key })).status).toBe(403);
    expect((await call('GET', '/api/v1/products', { apiKey: 'ak_live_nope' })).status).toBe(401);

    await call('DELETE', `/api/v1/api-keys/${k.json.id}`, { token: adminToken });
    expect((await call('GET', '/api/v1/products', { apiKey: key })).status).toBe(401);
  });

  test('RBAC: viewer cannot trigger syncs or manage accounts', async () => {
    const v = await call('POST', '/api/v1/auth/login', { body: { email: 'viewer@example.com', password: 'viewer password 123' } });
    const token = String(v.json.accessToken);
    expect((await call('GET', '/api/v1/products', { token })).status).toBe(200);
    expect((await call('POST', '/api/v1/sync/products', { token, body: { accountId } })).status).toBe(403);
    expect((await call('GET', '/api/v1/users', { token })).status).toBe(403);
  });

  test('analytics overview, settings, audit log', async () => {
    const a = await call('GET', '/api/v1/analytics/overview?days=7', { token: adminToken });
    expect(a.status).toBe(200);
    expect(a.json.totals).toMatchObject({ products: 2, links: 1, clicks: 1, activeCampaigns: 1 });

    const s = await call('PUT', '/api/v1/settings', {
      token: adminToken,
      body: { syncCron: '0 */4 * * *', syncEnabled: true, priceHistoryRetentionDays: 90, clickRetentionDays: 90, defaultSyncKeywords: ['coffee'] }
    });
    expect(s.status).toBe(200);
    const schedulers = await c.syncQueue.queue.getJobSchedulers();
    expect(schedulers.map((x) => x.pattern)).toContain('0 */4 * * *');

    await Bun.sleep(100);
    const logs = await call('GET', '/api/v1/audit-logs?onlyActions=true', { token: adminToken });
    const actions = (logs.json.data ?? []).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.login', 'account.create', 'affiliate.generate-link', 'api-key.create', 'settings.update']));
  });

  test('retention pruning respects settings', async () => {
    const future = new Date(Date.now() + 400 * 86_400_000);
    const pruned = await c.settings.applyRetention(future);
    expect(pruned.priceHistories).toBe(2);
    expect(pruned.clickEvents).toBe(1);
    expect(await c.prisma.product.count()).toBe(2);
  });

  test('OpenAPI document is served', async () => {
    const r = await call('GET', '/docs/json');
    expect(r.status).toBe(200);
    const paths = Object.keys((r.json.paths ?? {}) as Record<string, unknown>);
    expect(paths).toEqual(expect.arrayContaining(['/api/v1/products', '/api/v1/affiliate/generate-link', '/api/v1/sync/products']));
  });
});
