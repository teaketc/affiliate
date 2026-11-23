import { describe, expect, test } from 'bun:test';
import type { HttpClient, HttpResponse } from '../../src/extractors/http/http-client';
import { MockHttpClient } from '../../src/extractors/http/mock-http-client';
import { LazadaExtractor } from '../../src/extractors/lazada/lazada-extractor';
import { ShopeeExtractor } from '../../src/extractors/shopee/shopee-extractor';
import { AppError } from '../../src/lib/errors';

function fakeHttp(res: Partial<HttpResponse> & { finalUrl: string }): HttpClient {
	return {
		mode: 'live',
		get: async () => ({ status: 200, contentType: 'text/html', body: '', redirectChain: [], ...res })
	};
}

async function codeOf(p: Promise<unknown>) {
	try {
		await p;
		return 'NO_ERROR';
	} catch (e) {
		return e instanceof AppError ? e.code : 'UNKNOWN';
	}
}

describe('ShopeeExtractor', () => {
	test('extracts from OG + JSON-LD after short-link redirect', async () => {
		const http = fakeHttp({
			finalUrl: 'https://shopee.co.th/Nice-Bag-i.11.22?sp_atk=abc',
			redirectChain: ['https://shopee.co.th/Nice-Bag-i.11.22?sp_atk=abc'],
			body: `<head><meta property="og:title" content="Nice Bag | Shopee Thailand"><meta property="og:image" content="https://cf.shopee.co.th/file/x">
			<script type="application/ld+json">{"@type":"Product","name":"Nice Bag","offers":{"price":"350.00","priceCurrency":"THB"}}</script></head>`
		});
		const p = await new ShopeeExtractor(http).extract('https://s.shopee.co.th/abc');
		expect(p.productName).toBe('Nice Bag');
		expect(p.price).toBe(350);
		expect(p.currency).toBe('THB');
		expect(p.productImage).toBe('https://cf.shopee.co.th/file/x');
		expect(p.externalProductId).toBe('TH:11.22');
		expect(p.productUrl).toBe('https://shopee.co.th/product/11/22');
		expect(p.affiliateUrl).toBe('https://s.shopee.co.th/abc');
		expect(p.shopType).toBeNull();
		expect(p.rawData.fieldSources.productName).toBe('open-graph');
	});

	test('falls back to URL slug for name when page only has the site title', async () => {
		const http = fakeHttp({ finalUrl: 'https://shopee.co.th/Nice-Bag-i.11.22', body: '<title>Shopee Thailand</title>' });
		const p = await new ShopeeExtractor(http).extract('https://shopee.co.th/Nice-Bag-i.11.22');
		expect(p.productName).toBe('Nice Bag');
		expect(p.rawData.fieldSources.productName).toBe('url');
		expect(p.price).toBeNull();
	});

	test('login / captcha wall → PROVIDER_ACCESS_DENIED', async () => {
		const http = fakeHttp({ finalUrl: 'https://shopee.co.th/buyer/login?next=x' });
		expect(await codeOf(new ShopeeExtractor(http).extract('https://s.shopee.co.th/abc'))).toBe('PROVIDER_ACCESS_DENIED');
	});

	test('HTTP 403 → PROVIDER_ACCESS_DENIED, 404 → PRODUCT_NOT_FOUND', async () => {
		expect(await codeOf(new ShopeeExtractor(fakeHttp({ finalUrl: 'https://shopee.co.th/product/1/2', status: 403 })).extract('https://shopee.co.th/product/1/2'))).toBe('PROVIDER_ACCESS_DENIED');
		expect(await codeOf(new ShopeeExtractor(fakeHttp({ finalUrl: 'https://shopee.co.th/product/1/2', status: 404 })).extract('https://shopee.co.th/product/1/2'))).toBe('PRODUCT_NOT_FOUND');
	});

	test('non-product final page → INVALID_AFFILIATE_URL', async () => {
		expect(await codeOf(new ShopeeExtractor(fakeHttp({ finalUrl: 'https://shopee.co.th/' })).extract('https://s.shopee.co.th/x'))).toBe('INVALID_AFFILIATE_URL');
	});
});

describe('LazadaExtractor', () => {
	test('prefers canonical link when it matches the same product', async () => {
		const http = fakeHttp({
			finalUrl: 'https://www.lazada.co.th/products/cable-i55-s66.html?spm=tracking',
			body: '<head><link rel="canonical" href="https://www.lazada.co.th/products/cable-i55.html"><meta property="og:title" content="USB Cable | Lazada.co.th"></head>'
		});
		const p = await new LazadaExtractor(http).extract('https://c.lazada.co.th/t/c.abc');
		expect(p.productUrl).toBe('https://www.lazada.co.th/products/cable-i55.html');
		expect(p.externalProductId).toBe('TH:55');
		expect(p.productName).toBe('USB Cable');
	});

	test('mock HTTP client exercises the full pipeline', async () => {
		const p = await new LazadaExtractor(new MockHttpClient()).extract('https://s.lazada.co.th/s.xyz');
		expect(p.productName?.startsWith('[MOCK]')).toBe(true);
		expect(p.rawData.mode).toBe('mock');
		expect(p.price).not.toBeNull();
	});
});
