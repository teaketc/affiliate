import { describe, expect, test } from 'bun:test';
import { AppError } from '../../src/lib/errors';
import { detectMarketplace, regionFromHost } from '../../src/security/marketplaces';
import { validateAffiliateUrl } from '../../src/security/url-guard';

function codeOf(fn: () => unknown): string | null {
	try {
		fn();
		return null;
	} catch (e) {
		return e instanceof AppError ? e.code : 'UNKNOWN';
	}
}

describe('validateAffiliateUrl', () => {
	test.each([
		['https://shopee.co.th/product/1/2', 'SHOPEE'],
		['https://s.shopee.co.th/7AbCdEf', 'SHOPEE'],
		['https://shp.ee/abc', 'SHOPEE'],
		['https://www.lazada.co.th/products/x-i123-s456.html', 'LAZADA'],
		['https://c.lazada.co.th/t/c.abc', 'LAZADA'],
		['  https://SHOPEE.CO.TH./product/1/2  ', 'SHOPEE']
	])('accepts %s', (url, marketplace) => {
		expect(validateAffiliateUrl(url).marketplace).toBe(marketplace as 'SHOPEE' | 'LAZADA');
	});

	test.each([
		['', 'INVALID_URL'],
		['not a url', 'INVALID_URL'],
		['ftp://shopee.co.th/x', 'INVALID_URL'],
		['javascript:alert(1)', 'INVALID_URL'],
		['file:///etc/passwd', 'INVALID_URL'],
		['https://user:pass@shopee.co.th/x', 'INVALID_URL'],
		['https://shopee.co.th:8443/x', 'INVALID_URL'],
		['http://127.0.0.1/x', 'INVALID_URL'],
		['http://[::1]/x', 'INVALID_URL'],
		['http://169.254.169.254/latest/meta-data', 'INVALID_URL'],
		['http://localhost/x', 'INVALID_URL'],
		['https://shopee.co.th/a\nb', 'INVALID_URL'],
		['https://amazon.com/x', 'UNSUPPORTED_MARKETPLACE'],
		['https://shopee.co.th.evil.com/x', 'UNSUPPORTED_MARKETPLACE'],
		['https://evilshopee.co.th/x', 'UNSUPPORTED_MARKETPLACE'],
		['https://' + 'a'.repeat(2050) + '.shopee.co.th', 'INVALID_URL']
	])('rejects %s', (url, code) => {
		expect(codeOf(() => validateAffiliateUrl(url))).toBe(code);
	});

	test('rejects non-string input', () => expect(codeOf(() => validateAffiliateUrl(42))).toBe('INVALID_URL'));
});

test('detectMarketplace / regionFromHost', () => {
	expect(detectMarketplace('www.lazada.sg')).toBe('LAZADA');
	expect(detectMarketplace('lazada.com')).toBeNull();
	expect(regionFromHost('shopee.co.th')).toBe('TH');
	expect(regionFromHost('www.lazada.com.my')).toBe('MY');
});
