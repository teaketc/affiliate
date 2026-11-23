import { describe, expect, test } from 'bun:test';
import { decodeEntities, mergeCandidates, normalizeCurrency, normalizeImages, normalizePrice, normalizeText } from '../../src/extractors/normalizer';

describe('normalizePrice', () => {
	test.each([
		[599, 599],
		['1,299.00', 1299],
		['฿1,299', 1299],
		['1299 - 1599', 1299],
		['12.345', 12.35],
		['0', 0]
	])('%p → %p', (input, out) => expect(normalizePrice(input)).toBe(out));

	test.each([null, undefined, '', 'free', -5, Number.NaN, '1.2.3', {}, 1e12])('%p → null', (input) => expect(normalizePrice(input)).toBeNull());
});

test('normalizeCurrency', () => {
	expect(normalizeCurrency('thb')).toBe('THB');
	expect(normalizeCurrency('฿')).toBeNull();
	expect(normalizeCurrency(5)).toBeNull();
});

test('normalizeText decodes entities and collapses whitespace', () => {
	expect(normalizeText('  A &amp; B\n\t C &#3588; ', 100)).toBe('A & B C ค');
	expect(normalizeText('   ', 100)).toBeNull();
	expect(normalizeText('abcdef', 3)).toBe('abc');
	expect(decodeEntities('&unknown;')).toBe('&unknown;');
});

test('normalizeImages keeps http(s), fixes protocol-relative, dedupes', () => {
	expect(normalizeImages(['//cf.shopee.co.th/a.jpg', 'https://cf.shopee.co.th/a.jpg', 'javascript:alert(1)', 'nope', 5])).toEqual([
		'https://cf.shopee.co.th/a.jpg'
	]);
});

describe('mergeCandidates', () => {
	test('first valid source wins per field; nothing invented', () => {
		const { fields, fieldSources } = mergeCandidates([
			{ source: 'open-graph', productName: 'OG Name', price: 'n/a', productImages: ['https://img/1.jpg'] },
			{ source: 'json-ld', productName: 'LD Name', price: '450.50', currency: 'THB', shopName: 'Shop' },
			{ source: 'url', externalProductId: 'TH:1.2' }
		]);
		expect(fields.productName).toBe('OG Name');
		expect(fields.price).toBe(450.5);
		expect(fields.currency).toBe('THB');
		expect(fields.shopName).toBe('Shop');
		expect(fields.productImage).toBe('https://img/1.jpg');
		expect(fields.originalPrice).toBeNull();
		expect(fields.shopType).toBeNull();
		expect(fieldSources.price).toBe('json-ld');
		expect(fieldSources.productName).toBe('open-graph');
	});

	test('drops original price that is not above price', () => {
		const { fields } = mergeCandidates([{ source: 'json-ld', price: 100, originalPrice: 90 }]);
		expect(fields.originalPrice).toBeNull();
	});
});
