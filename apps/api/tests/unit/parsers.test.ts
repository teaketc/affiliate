import { describe, expect, test } from 'bun:test';
import { lazadaAdapter } from '../../src/extractors/lazada/lazada-adapter';
import { slugToName } from '../../src/extractors/metadata-extractor';
import { shopeeAdapter } from '../../src/extractors/shopee/shopee-adapter';
import { parseHtmlMetadata } from '../../src/extractors/sources/html-metadata';
import { findJsonLdProduct, readJsonLdProduct } from '../../src/extractors/sources/json-ld';

describe('shopeeAdapter.parseProductUrl', () => {
	test('slug URL', () => {
		const r = shopeeAdapter.parseProductUrl(new URL('https://shopee.co.th/Cool-Phone-Case-i.123456.987654321?sp_atk=x'));
		expect(r).toEqual({ externalProductId: 'TH:123456.987654321', canonicalUrl: 'https://shopee.co.th/product/123456/987654321', slugName: 'Cool Phone Case' });
	});
	test('/product/ URL and universal-link', () => {
		expect(shopeeAdapter.parseProductUrl(new URL('https://shopee.sg/product/1/2'))?.externalProductId).toBe('SG:1.2');
		expect(shopeeAdapter.parseProductUrl(new URL('https://shopee.co.th/universal-link/product/5/6'))?.externalProductId).toBe('TH:5.6');
	});
	test('/opaanlp/ URL (where s.shopee.* affiliate short links resolve)', () => {
		const r = shopeeAdapter.parseProductUrl(new URL('https://shopee.co.th/opaanlp/401568048/16133303280?__mobile__=1&utm_medium=affiliates'));
		expect(r).toEqual({ externalProductId: 'TH:401568048.16133303280', canonicalUrl: 'https://shopee.co.th/product/401568048/16133303280', slugName: null });
	});
	test('non-product URLs', () => {
		expect(shopeeAdapter.parseProductUrl(new URL('https://shopee.co.th/opaanlp/abc/1'))).toBeNull();
		expect(shopeeAdapter.parseProductUrl(new URL('https://shopee.co.th/'))).toBeNull();
		expect(shopeeAdapter.parseProductUrl(new URL('https://s.shopee.co.th/7AbC'))).toBeNull();
	});
	test('blocked pages and titles', () => {
		expect(shopeeAdapter.isAccessBlocked(new URL('https://shopee.co.th/verify/traffic'), 200, null)).toBe(true);
		expect(shopeeAdapter.isAccessBlocked(new URL('https://shopee.co.th/buyer/login?next=x'), 200, null)).toBe(true);
		const empty = { openGraph: {}, ogImages: [], jsonLd: [], title: null, canonical: null, description: null };
		expect(shopeeAdapter.isAccessBlocked(new URL('https://shopee.co.th/product/1/2'), 200, empty)).toBe(true);
		expect(shopeeAdapter.isAccessBlocked(new URL('https://shopee.co.th/product/1/2'), 200, { ...empty, title: 'Bag | Shopee Thailand' })).toBe(false);
		expect(shopeeAdapter.cleanTitle('Cool Case | Shopee Thailand')).toBe('Cool Case');
		expect(shopeeAdapter.cleanTitle('Shopee Thailand')).toBe('');
	});
});

describe('lazadaAdapter.parseProductUrl', () => {
	test('slug + sku URL', () => {
		const r = lazadaAdapter.parseProductUrl(new URL('https://www.lazada.co.th/products/usb-cable-i12345-s67890.html?spm=abc'));
		expect(r).toEqual({ externalProductId: 'TH:12345', canonicalUrl: 'https://www.lazada.co.th/products/usb-cable-i12345-s67890.html', slugName: 'usb cable' });
	});
	test('bare id URL', () => expect(lazadaAdapter.parseProductUrl(new URL('https://www.lazada.sg/products/i999.html'))?.externalProductId).toBe('SG:999'));
	test('non-product', () => expect(lazadaAdapter.parseProductUrl(new URL('https://www.lazada.co.th/shop/abc'))).toBeNull());
	test('anti-bot page', () => expect(lazadaAdapter.isAccessBlocked(new URL('https://www.lazada.co.th/_____tmd_____/punish?x=1'), 200, null)).toBe(true));
});

test('slugToName', () => {
	expect(slugToName('%E0%B8%A1%E0%B8%B5-Phone')).toBe('มี Phone');
	expect(slugToName('123')).toBeNull();
	expect(slugToName(undefined)).toBeNull();
});

describe('parseHtmlMetadata + JSON-LD', () => {
	const html = `<!doctype html><html><head>
		<title> Widget | Lazada.co.th </title>
		<meta property="og:title" content="Widget &amp; Co">
		<meta property="og:image" content="https://img/1.jpg"><meta property="og:image" content="https://img/2.jpg">
		<meta property="product:price:amount" content="1,299.00">
		<link rel="canonical" href="https://www.lazada.co.th/products/widget-i1-s2.html">
		<script type="application/ld+json">{ not json }</script>
		<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","name":"Widget","image":{"url":"https://img/3.jpg"},"offers":[{"@type":"AggregateOffer","lowPrice":"10","highPrice":"20","priceCurrency":"THB","seller":{"name":"Seller"}}]}]}</script>
	</head><body></body></html>`;

	test('extracts OG, title, canonical and JSON-LD Product from @graph', async () => {
		const meta = await parseHtmlMetadata(html);
		expect(meta.title).toBe('Widget | Lazada.co.th');
		expect(meta.openGraph['og:title']).toBe('Widget &amp; Co');
		expect(meta.ogImages).toEqual(['https://img/1.jpg', 'https://img/2.jpg']);
		expect(meta.canonical).toBe('https://www.lazada.co.th/products/widget-i1-s2.html');
		expect(meta.jsonLd).toHaveLength(1);
		const node = findJsonLdProduct(meta.jsonLd);
		expect(node).not.toBeNull();
		const ld = readJsonLdProduct(node as Record<string, unknown>);
		expect(ld.name).toBe('Widget');
		expect(ld.images).toEqual(['https://img/3.jpg']);
		expect(ld.lowPrice).toBe('10');
		expect(ld.currency).toBe('THB');
		expect(ld.sellerName).toBe('Seller');
	});
});
