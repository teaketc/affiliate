/**
 * Integration tests: real Elysia app + real PostgreSQL + MockHttpClient (no network).
 * Requires TEST_DATABASE_URL pointing at a migrated, disposable database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { ApiResponse, ExtractResultDTO, ExtractionLogDetailDTO, ExtractionLogDTO, Paginated, ProductDTO, StatisticsDTO } from '@affiliate/shared';
import { createApp } from '../../src/app';
import { createPrisma } from '../../src/db/prisma';
import { MockHttpClient } from '../../src/extractors/http/mock-http-client';
import { createDefaultRegistry } from '../../src/extractors/registry';
import { silentLogger } from '../../src/lib/logger';
import { MemoryRateLimiter } from '../../src/security/rate-limit';

const databaseUrl = process.env.TEST_DATABASE_URL;
const prisma = createPrisma(databaseUrl ?? 'postgresql://invalid');

function build(rateLimitMax = 1000) {
	return createApp({
		config: { corsOrigins: ['http://localhost:5173'], trustProxy: false, nodeEnv: 'test' },
		prisma,
		registry: createDefaultRegistry(new MockHttpClient()),
		rateLimiter: new MemoryRateLimiter(rateLimitMax, 60_000),
		logger: silentLogger
	});
}

let app = build();

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: ApiResponse<T> }> {
	const res = await app.handle(
		new Request(`http://localhost${path}`, {
			method,
			headers: body ? { 'content-type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined
		})
	);
	return { status: res.status, json: (await res.json()) as ApiResponse<T> };
}

function data<T>(r: { json: ApiResponse<T> }): T {
	if (!r.json.success) throw new Error(`Expected success, got ${JSON.stringify(r.json)}`);
	return r.json.data;
}

const extract = (affiliateUrl: string) => call<ExtractResultDTO>('POST', '/api/v1/extractor', { affiliateUrl });

describe.skipIf(!databaseUrl)('API integration', () => {
	beforeAll(async () => {
		await prisma.$connect();
	});
	beforeEach(async () => {
		await prisma.$executeRawUnsafe('TRUNCATE extraction_logs, products CASCADE');
		app = build();
	});
	afterAll(async () => {
		await prisma.$disconnect();
	});

	test('health and ready', async () => {
		expect((await app.handle(new Request('http://localhost/health'))).status).toBe(200);
		expect((await app.handle(new Request('http://localhost/ready'))).status).toBe(200);
	});

	test('extract → auto-saved product + SUCCESS log', async () => {
		const r = await extract('https://s.shopee.co.th/AbCdEf');
		expect(r.status).toBe(201);
		expect(r.json.status).toBe('success');
		const p = data(r);
		expect(p.saved).toBe(true);
		expect(p.duplicate).toBe(false);
		expect(p.productName).toStartWith('[MOCK]');
		expect(p.marketplace).toBe('SHOPEE');
		expect(typeof p.price).toBe('number');

		const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
		expect(row.productUrl).toMatch(/^https:\/\/shopee\.co\.th\/product\/\d+\/\d+$/);
		const logs = await prisma.extractionLog.findMany({ where: { productId: p.id } });
		expect(logs).toHaveLength(1);
		expect(logs[0]?.status).toBe('SUCCESS');
	});

	test('duplicate: same product via different affiliate URLs updates, never duplicates', async () => {
		const first = data(await extract('https://s.shopee.co.th/SameOne'));
		// A different link form (slug URL + tracking params) for the same shop/item id
		const [shopId, itemId] = first.productUrl.split('/product/')[1]?.split('/') ?? [];
		const productUrlVariant = await extract(`https://shopee.co.th/Another-Slug-i.${shopId}.${itemId}?utm=1`);
		const again = data(productUrlVariant);
		expect(again.id).toBe(first.id);
		expect(again.duplicate).toBe(true);
		expect(again.affiliateUrl).toContain('utm=1');
		expect(await prisma.product.count()).toBe(1);
		expect(await prisma.extractionLog.count({ where: { productId: first.id } })).toBeGreaterThanOrEqual(2);
	});

	test('duplicate update never overwrites existing values with null', async () => {
		const full = data(await extract('https://shopee.co.th/Bag-i.10.20'));
		expect(full.price).not.toBeNull();
		await prisma.product.update({ where: { id: full.id }, data: { shopName: 'Kept Shop' } });
		// The partial page for the same product id carries no price/image/shop
		const partial = await extract('https://shopee.co.th/Bag-mock-partial-i.10.20');
		expect(partial.json.status).toBe('partial');
		const merged = data(partial);
		expect(merged.id).toBe(full.id);
		expect(merged.price).toBe(full.price);
		expect(merged.productImage).toBe(full.productImage);
		expect(merged.shopName).toBe('Kept Shop');
	});

	test('concurrent extraction of the same product creates exactly one row', async () => {
		const results = await Promise.all(Array.from({ length: 6 }, () => extract('https://shopee.co.th/Race-i.77.88')));
		const ids = new Set(results.map((r) => data(r).id));
		expect(ids.size).toBe(1);
		expect(await prisma.product.count()).toBe(1);
		expect(await prisma.extractionLog.count()).toBe(6);
	});

	test('partial extraction is saved with PARTIAL status and missing fields', async () => {
		const r = await extract('https://www.lazada.co.th/products/thing-mock-partial-i123-s4.html');
		expect(r.status).toBe(201);
		expect(r.json.status).toBe('partial');
		const p = data(r);
		expect(p.missingFields).toEqual(['price', 'productImage']);
		expect(p.price).toBeNull();
		const log = await prisma.extractionLog.findUniqueOrThrow({ where: { id: p.logId } });
		expect(log.status).toBe('PARTIAL');
		expect(log.errorCode).toBe('PARTIAL_EXTRACTION');
	});

	test.each([
		['http://169.254.169.254/latest', 400, 'INVALID_URL'],
		['https://amazon.com/dp/1', 400, 'UNSUPPORTED_MARKETPLACE'],
		['https://shopee.co.th/', 400, 'INVALID_AFFILIATE_URL'],
		['https://s.shopee.co.th/mock-blocked', 502, 'PROVIDER_ACCESS_DENIED'],
		['https://s.lazada.co.th/mock-notfound', 404, 'PRODUCT_NOT_FOUND'],
		['https://s.shopee.co.th/mock-timeout', 504, 'REQUEST_TIMEOUT']
	])('failure %s → %i %s, with FAILED log', async (url, status, code) => {
		const r = await extract(url);
		expect(r.status).toBe(status);
		expect(r.json.success).toBe(false);
		if (r.json.success) return;
		expect(r.json.status).toBe('failed');
		expect(r.json.error.code).toBe(code as never);
		const logs = await prisma.extractionLog.findMany();
		expect(logs).toHaveLength(1);
		expect(logs[0]?.status).toBe('FAILED');
		expect(logs[0]?.errorCode).toBe(code);
		expect(await prisma.product.count()).toBe(0);
	});

	describe('Shopee login wall → manual completion', () => {
		const shortLink = 'https://s.shopee.co.th/mock-loginwall-abc';
		const manual = (body: Record<string, unknown>) => call<ExtractResultDTO>('POST', '/api/v1/products/manual', body);

		test('extract returns PROVIDER_ACCESS_DENIED with verified manual-entry context and logs FAILED', async () => {
			const r = await extract(shortLink);
			expect(r.status).toBe(502);
			if (r.json.success) throw new Error('expected failure');
			expect(r.json.error.code).toBe('PROVIDER_ACCESS_DENIED');
			const details = r.json.error.details as { logId: string; manualEntry: { marketplace: string; externalProductId: string; productUrl: string; affiliateUrl: string } };
			expect(details.manualEntry.marketplace).toBe('SHOPEE');
			expect(details.manualEntry.externalProductId).toMatch(/^TH:\d+\.\d+$/);
			expect(details.manualEntry.productUrl).toMatch(/^https:\/\/shopee\.co\.th\/product\/\d+\/\d+$/);
			expect(details.manualEntry.affiliateUrl).toBe(shortLink);
			expect(await prisma.product.count()).toBe(0);
			const log = await prisma.extractionLog.findUniqueOrThrow({ where: { id: details.logId } });
			expect(log.status).toBe('FAILED');
		});

		test('manual save stores verified identity + user fields as PARTIAL, marked manual', async () => {
			const failed = await extract(shortLink);
			if (failed.json.success) throw new Error('expected failure');
			const ctx = (failed.json.error.details as { manualEntry: { externalProductId: string; productUrl: string } }).manualEntry;

			const r = await manual({ affiliateUrl: shortLink, productName: '  กระเป๋าผ้า  ', price: 299, currency: 'thb', shopName: 'ร้านทดสอบ' });
			expect(r.status).toBe(201);
			expect(r.json.status).toBe('partial');
			const p = data(r);
			expect(p).toMatchObject({ productName: 'กระเป๋าผ้า', price: 299, currency: 'THB', shopName: 'ร้านทดสอบ', productImage: null, shopType: null });
			// identity comes from the server-side resolve, not the request
			expect(p.externalProductId).toBe(ctx.externalProductId);
			expect(p.productUrl).toBe(ctx.productUrl);

			const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
			expect(row.rawData).toMatchObject({ sources: ['url', 'manual'], manualFields: ['productName', 'price', 'currency', 'shopName'] });
			const log = await prisma.extractionLog.findUniqueOrThrow({ where: { id: p.logId } });
			expect(log.status).toBe('PARTIAL');
			expect(log.errorMessage).toContain('entered manually');

			// Same product again (manual) → updates, no duplicate row
			const again = data(await manual({ affiliateUrl: shortLink, productName: 'กระเป๋าผ้า v2', price: 279 }));
			expect(again.id).toBe(p.id);
			expect(again.duplicate).toBe(true);
			expect(again).toMatchObject({ productName: 'กระเป๋าผ้า v2', price: 279, shopName: 'ร้านทดสอบ' });
			expect(await prisma.product.count()).toBe(1);
		});

		test('manual save rejects links that do not resolve to a product, and bad input', async () => {
			expect((await manual({ affiliateUrl: 'https://shopee.co.th/', productName: 'x' })).status).toBe(400);
			expect((await manual({ affiliateUrl: 'https://amazon.com/dp/1', productName: 'x' })).status).toBe(400);
			expect((await manual({ affiliateUrl: shortLink, productName: '' })).status).toBe(400);
			expect((await manual({ affiliateUrl: shortLink, productName: 'x', price: -1 })).status).toBe(400);
			const badImg = await manual({ affiliateUrl: shortLink, productName: 'x', productImage: 'javascript:alert(1)' });
			expect(badImg.status).toBe(400);
			expect(await prisma.product.count()).toBe(0);
		});
	});

	test('body validation error', async () => {
		const r = await call('POST', '/api/v1/extractor', { nope: 1 });
		expect(r.status).toBe(400);
		expect(r.json.success).toBe(false);
	});

	test('rate limiting returns 429', async () => {
		app = build(2);
		await extract('https://s.shopee.co.th/r1');
		await extract('https://s.shopee.co.th/r2');
		const r = await extract('https://s.shopee.co.th/r3');
		expect(r.status).toBe(429);
		if (!r.json.success) expect(r.json.error.code).toBe('RATE_LIMITED');
	});

	test('products: list, search, filter, sort, pagination, detail, patch, delete', async () => {
		await extract('https://s.shopee.co.th/p1');
		await extract('https://s.shopee.co.th/p2');
		const lz = data(await extract('https://s.lazada.co.th/p3'));

		const all = data(await call<Paginated<ProductDTO>>('GET', '/api/v1/products?pageSize=2'));
		expect(all.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
		expect(all.items[0]?.id).toBe(lz.id); // newest first

		const lazada = data(await call<Paginated<ProductDTO>>('GET', '/api/v1/products?marketplace=LAZADA'));
		expect(lazada.items.map((p) => p.id)).toEqual([lz.id]);

		const search = data(await call<Paginated<ProductDTO>>('GET', `/api/v1/products?search=${encodeURIComponent('lazada product')}`));
		expect(search.items).toHaveLength(1);

		const asc = data(await call<Paginated<ProductDTO>>('GET', '/api/v1/products?order=asc'));
		expect(asc.items.at(-1)?.id).toBe(lz.id);

		expect((await call('GET', '/api/v1/products?marketplace=EBAY')).status).toBe(400);

		const detail = await call<ProductDTO>('GET', `/api/v1/products/${lz.id}`);
		expect(detail.status).toBe(200);

		const patched = data(
			await call<ProductDTO>('PATCH', `/api/v1/products/${lz.id}`, { productName: 'Renamed', shopType: 'MALL', price: 12.5, currency: 'thb' })
		);
		expect(patched).toMatchObject({ productName: 'Renamed', shopType: 'MALL', price: 12.5, currency: 'THB' });
		const filtered = data(await call<Paginated<ProductDTO>>('GET', '/api/v1/products?shopType=MALL'));
		expect(filtered.items.map((p) => p.id)).toEqual([lz.id]);

		const badAffiliate = await call('PATCH', `/api/v1/products/${lz.id}`, { affiliateUrl: 'https://shopee.co.th/product/1/2' });
		expect(badAffiliate.status).toBe(400);
		expect((await call('PATCH', `/api/v1/products/${lz.id}`, { price: -1 })).status).toBe(400);
		// Unknown fields are stripped by schema normalisation and have no effect
		const ignored = data(await call<ProductDTO>('PATCH', `/api/v1/products/${lz.id}`, { unknownField: 1 }));
		expect(ignored.productName).toBe('Renamed');

		const del = await call('DELETE', `/api/v1/products/${lz.id}`);
		expect(del.status).toBe(200);
		expect((await call('GET', `/api/v1/products/${lz.id}`)).status).toBe(404);
		expect((await call('GET', '/api/v1/products/not-a-uuid')).status).toBe(400);
		// logs survive product deletion
		expect(await prisma.extractionLog.count({ where: { productId: null, status: 'SUCCESS' } })).toBe(1);
	});

	test('extraction logs list/detail and statistics', async () => {
		const ok1 = data(await extract('https://s.shopee.co.th/s1'));
		await extract('https://www.lazada.co.th/products/z-mock-partial-i9.html');
		await extract('https://example.com/x');

		const logs = data(await call<Paginated<ExtractionLogDTO>>('GET', '/api/v1/extraction-logs'));
		expect(logs.pagination.total).toBe(3);
		expect(logs.items.map((l) => l.status).sort()).toEqual(['FAILED', 'PARTIAL', 'SUCCESS']);

		const failed = data(await call<Paginated<ExtractionLogDTO>>('GET', '/api/v1/extraction-logs?status=FAILED'));
		expect(failed.items).toHaveLength(1);
		expect(failed.items[0]?.marketplace).toBeNull();

		const detail = data(await call<ExtractionLogDetailDTO>('GET', `/api/v1/extraction-logs/${ok1.logId}`));
		expect(detail.product?.id).toBe(ok1.id);
		expect(detail.extractedData).toBeTruthy();

		const stats = data(await call<StatisticsDTO>('GET', '/api/v1/statistics'));
		expect(stats).toEqual({
			totalProducts: 2,
			shopeeProducts: 1,
			lazadaProducts: 1,
			successfulExtractions: 1,
			partialExtractions: 1,
			failedExtractions: 1,
			totalExtractions: 3
		});
	});

	test('unknown route → 404 standard error', async () => {
		const r = await call('GET', '/api/v1/nope');
		expect(r.status).toBe(404);
		expect(r.json.success).toBe(false);
	});
});
