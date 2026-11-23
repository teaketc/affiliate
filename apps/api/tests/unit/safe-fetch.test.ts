import { describe, expect, test } from 'bun:test';
import { AppError } from '../../src/lib/errors';
import { isMarketplaceHost } from '../../src/security/marketplaces';
import { safeFetch, type DnsResolver, type Transport, type TransportRequest } from '../../src/security/safe-fetch';

const options = { timeoutMs: 500, maxRedirects: 3, maxResponseBytes: 1000, isAllowedHost: isMarketplaceHost };
const publicResolver: DnsResolver = { resolve: async () => ['104.20.23.154'] };

function transportFrom(map: Record<string, () => Response>, seen: TransportRequest[] = []): Transport {
	return async (req) => {
		seen.push(req);
		const handler = map[req.url.toString()];
		if (!handler) return new Response('missing', { status: 404 });
		return handler();
	};
}

async function errorCode(p: Promise<unknown>): Promise<string> {
	try {
		await p;
		return 'NO_ERROR';
	} catch (e) {
		return e instanceof AppError ? e.code : `UNKNOWN:${String(e)}`;
	}
}

const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });
const html = (body: string) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

describe('safeFetch', () => {
	test('follows allowed redirects, pins resolved IP and keeps Host', async () => {
		const seen: TransportRequest[] = [];
		const transport = transportFrom(
			{
				'https://s.shopee.co.th/abc': redirect('https://shopee.co.th/product/1/2?x=1'),
				'https://shopee.co.th/product/1/2?x=1': html('<title>ok</title>')
			},
			seen
		);
		const res = await safeFetch('https://s.shopee.co.th/abc', options, { resolver: publicResolver, transport });
		expect(res.finalUrl).toBe('https://shopee.co.th/product/1/2?x=1');
		expect(res.redirectChain).toEqual(['https://shopee.co.th/product/1/2?x=1']);
		expect(res.body).toBe('<title>ok</title>');
		expect(seen.every((r) => r.ip === '104.20.23.154')).toBe(true);
	});

	test('blocks redirect to cloud metadata IP', async () => {
		const transport = transportFrom({ 'https://s.shopee.co.th/abc': redirect('http://169.254.169.254/latest/meta-data') });
		expect(await errorCode(safeFetch('https://s.shopee.co.th/abc', options, { resolver: publicResolver, transport }))).toBe('INVALID_URL');
	});

	test('blocks redirect to non-allowlisted host', async () => {
		const transport = transportFrom({ 'https://s.shopee.co.th/abc': redirect('https://evil.example.com/') });
		expect(await errorCode(safeFetch('https://s.shopee.co.th/abc', options, { resolver: publicResolver, transport }))).toBe('REDIRECT_FAILED');
	});

	test('blocks redirect to non-http scheme', async () => {
		const transport = transportFrom({ 'https://s.shopee.co.th/abc': redirect('file:///etc/passwd') });
		expect(await errorCode(safeFetch('https://s.shopee.co.th/abc', options, { resolver: publicResolver, transport }))).toBe('INVALID_URL');
	});

	test('DNS rebinding: allowlisted host resolving to private IP is refused before connecting', async () => {
		const seen: TransportRequest[] = [];
		const resolver: DnsResolver = { resolve: async () => ['104.20.23.154', '10.0.0.7'] };
		const transport = transportFrom({}, seen);
		expect(await errorCode(safeFetch('https://shopee.co.th/x', options, { resolver, transport }))).toBe('INVALID_URL');
		expect(seen).toHaveLength(0);
	});

	test('re-resolves on every hop (second hop resolving to loopback is blocked)', async () => {
		let calls = 0;
		const resolver: DnsResolver = { resolve: async () => (++calls === 1 ? ['104.20.23.154'] : ['127.0.0.1']) };
		const transport = transportFrom({ 'https://s.shopee.co.th/abc': redirect('https://shopee.co.th/product/1/2') });
		expect(await errorCode(safeFetch('https://s.shopee.co.th/abc', options, { resolver, transport }))).toBe('INVALID_URL');
		expect(calls).toBe(2);
	});

	test('limits redirect depth', async () => {
		const transport: Transport = async ({ url }) =>
			new Response(null, { status: 302, headers: { location: `https://shopee.co.th/r${Number(url.pathname.slice(2) || 0) + 1}` } });
		expect(await errorCode(safeFetch('https://shopee.co.th/r0', options, { resolver: publicResolver, transport }))).toBe('REDIRECT_FAILED');
	});

	test('enforces response size limit (streamed)', async () => {
		const transport = transportFrom({ 'https://shopee.co.th/big': () => new Response('x'.repeat(5000), { status: 200 }) });
		expect(await errorCode(safeFetch('https://shopee.co.th/big', options, { resolver: publicResolver, transport }))).toBe('EXTRACTION_FAILED');
	});

	test('times out slow responses', async () => {
		const transport: Transport = ({ signal }) =>
			new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
		expect(await errorCode(safeFetch('https://shopee.co.th/slow', { ...options, timeoutMs: 50 }, { resolver: publicResolver, transport }))).toBe(
			'REQUEST_TIMEOUT'
		);
	});

	test('unresolvable first host → INVALID_AFFILIATE_URL', async () => {
		const resolver: DnsResolver = { resolve: async () => Promise.reject(new Error('ENOTFOUND')) };
		expect(await errorCode(safeFetch('https://shopee.co.th/x', options, { resolver, transport: transportFrom({}) }))).toBe('INVALID_AFFILIATE_URL');
	});
});
