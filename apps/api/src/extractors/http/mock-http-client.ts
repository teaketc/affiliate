import { AppError } from '../../lib/errors';
import { detectMarketplace } from '../../security/marketplaces';
import { lazadaAdapter } from '../lazada/lazada-adapter';
import { shopeeAdapter } from '../shopee/shopee-adapter';
import type { HttpClient, HttpResponse } from './http-client';

function fnv1a(input: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * DEVELOPMENT ONLY (EXTRACTOR_MODE=mock). Never makes network requests.
 * Simulates short-link redirects and serves deterministic product pages whose
 * names are prefixed with "[MOCK]" so they can never be mistaken for real data.
 * The rest of the pipeline (parsing, normalising, dedupe, auto-save, logs) is real.
 *
 * Magic path fragments for exercising error handling:
 *   mock-blocked → 403, mock-notfound → 404, mock-timeout → timeout,
 *   mock-partial → page with only a title (no price/image),
 *   mock-loginwall → Shopee /opaanlp/ product page served as an empty JS shell (what real
 *                    logged-out visitors get), so manual completion can be exercised.
 */
export class MockHttpClient implements HttpClient {
	readonly mode = 'mock' as const;

	async get(input: string): Promise<HttpResponse> {
		const url = new URL(input);
		const marketplace = detectMarketplace(url.hostname);
		if (!marketplace) throw new AppError('UNSUPPORTED_MARKETPLACE', `Host "${url.hostname}" is not allowed`);
		const path = url.pathname.toLowerCase();
		if (path.includes('mock-timeout')) throw new AppError('REQUEST_TIMEOUT', 'Simulated timeout (mock mode)');

		const adapter = marketplace === 'SHOPEE' ? shopeeAdapter : lazadaAdapter;
		const redirectChain: string[] = [];
		let productUrl = url;

		const host = url.hostname.toLowerCase();
		const isShortLink = /^(s|c)\./.test(host) || host === 'shp.ee' || host === 'shope.ee';
		if (!adapter.parseProductUrl(url) && !isShortLink) {
			// A marketplace page that is not a product (home, search, shop…)
			return this.page(url, 200, `<title>${marketplace === 'SHOPEE' ? 'Shopee Thailand' : 'Lazada.co.th'}</title>`, redirectChain);
		}
		if (isShortLink) {
			// Treat as an affiliate / short link and "redirect" to a deterministic product URL.
			const seed = fnv1a(url.pathname + url.search);
			const shopId = 100_000 + (seed % 900_000);
			const itemId = 1_000_000 + (seed % 9_000_000);
			const flag = ['mock-blocked', 'mock-notfound', 'mock-partial', 'mock-loginwall'].find((f) => path.includes(f));
			const slug = `Mock-Product-${seed % 10_000}${flag ? `-${flag}` : ''}`;
			productUrl =
				flag === 'mock-loginwall' && marketplace === 'SHOPEE'
					? new URL(`https://shopee.co.th/opaanlp/${shopId}/${itemId}?mock=loginwall`)
					: marketplace === 'SHOPEE'
					? new URL(`https://shopee.co.th/${slug}-i.${shopId}.${itemId}?sp_atk=mock`)
					: new URL(`https://www.lazada.co.th/products/${slug.toLowerCase()}-i${itemId}-s${itemId + 7}.html?mock=1`);
			redirectChain.push(productUrl.toString());
		}

		const finalPath = productUrl.pathname.toLowerCase();
		if (productUrl.search.includes('mock=loginwall') || finalPath.includes('mock-loginwall')) {
			// Real Shopee: logged-out visitors get a JS shell with no title / OG / JSON-LD
			return this.page(productUrl, 200, '<meta charset="utf-8"><script src="/assets/bundle.js"></script>', redirectChain);
		}
		if (finalPath.includes('mock-blocked')) return this.page(productUrl, 403, '<title>Access denied</title>', redirectChain);
		if (finalPath.includes('mock-notfound')) return this.page(productUrl, 404, '<title>Not found</title>', redirectChain);

		const parsed = adapter.parseProductUrl(productUrl);
		const seed = fnv1a(parsed?.externalProductId ?? productUrl.pathname);
		const name = `[MOCK] ${marketplace === 'SHOPEE' ? 'Shopee' : 'Lazada'} Product #${seed % 10_000}`;

		if (finalPath.includes('mock-partial')) {
			return this.page(productUrl, 200, `<meta property="og:title" content="${escapeHtml(name)}">`, redirectChain);
		}

		const price = 99 + (seed % 2000);
		const image = `https://placehold.co/600x600/png?text=MOCK+${seed % 10_000}`;
		const jsonLd = {
			'@context': 'https://schema.org',
			'@type': 'Product',
			name,
			image: [image, `${image}-2`],
			offers: {
				'@type': 'Offer',
				price: price.toFixed(2),
				priceCurrency: 'THB',
				seller: { '@type': 'Organization', name: `[MOCK] Shop ${seed % 100}` }
			}
		};
		const head = [
			`<title>${escapeHtml(name)} | ${marketplace === 'SHOPEE' ? 'Shopee Thailand' : 'Lazada.co.th'}</title>`,
			`<meta property="og:title" content="${escapeHtml(name)}">`,
			`<meta property="og:image" content="${escapeHtml(image)}">`,
			`<meta property="product:price:amount" content="${price}">`,
			`<meta property="product:price:currency" content="THB">`,
			`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
		].join('\n');
		return this.page(productUrl, 200, head, redirectChain);
	}

	private page(url: URL, status: number, head: string, redirectChain: string[]): HttpResponse {
		return {
			finalUrl: url.toString(),
			status,
			contentType: 'text/html; charset=utf-8',
			body: `<!doctype html><html><head>${head}</head><body></body></html>`,
			redirectChain
		};
	}
}
