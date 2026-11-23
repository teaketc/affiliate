import type { Marketplace } from '@affiliate/shared';
import { AppError } from '../lib/errors';
import { detectMarketplace } from '../security/marketplaces';
import type { HttpClient, HttpResponse } from './http/http-client';
import { mergeCandidates, normalizeText } from './normalizer';
import { parseHtmlMetadata, type HtmlMetadata } from './sources/html-metadata';
import { findJsonLdProduct, readJsonLdProduct } from './sources/json-ld';
import type { AuthorizedProductSource, ExtractedProduct, ProductCandidate, ProductExtractor } from './types';

export interface ParsedProductUrl {
	/** Region-scoped marketplace product ID, e.g. "TH:123.456". */
	externalProductId: string;
	canonicalUrl: string;
	/** Human-readable slug from the URL path, if the marketplace puts one there. */
	slugName: string | null;
}

/** Everything that differs between marketplaces lives behind this adapter. */
export interface MarketplaceAdapter {
	readonly marketplace: Marketplace;
	parseProductUrl(url: URL): ParsedProductUrl | null;
	/** Detects login walls, captcha / traffic-verification and anti-bot pages. Never bypassed. */
	isAccessBlocked(finalUrl: URL, status: number, meta: HtmlMetadata | null): boolean;
	cleanTitle(title: string): string;
}

const ACCESS_DENIED_STATUSES = new Set([401, 403, 429, 451]);

/**
 * Strategy chain (in priority order):
 * 1. Authorised data sources (official API) — only when configured
 * 2. Open Graph metadata
 * 3. JSON-LD structured data
 * 4. Minimal HTML (<title>, canonical link)
 * 5. Product URL itself (IDs and slug)
 */
export class MetadataProductExtractor implements ProductExtractor {
	readonly marketplace: Marketplace;

	constructor(
		private readonly adapter: MarketplaceAdapter,
		private readonly http: HttpClient,
		private readonly authorizedSources: AuthorizedProductSource[] = []
	) {
		this.marketplace = adapter.marketplace;
	}

	async extract(affiliateUrl: string): Promise<ExtractedProduct> {
		const response = await this.http.get(affiliateUrl);
		const finalUrl = new URL(response.finalUrl);

		if (detectMarketplace(finalUrl.hostname) !== this.marketplace) {
			throw new AppError('INVALID_AFFILIATE_URL', `Link resolved to a different marketplace (${finalUrl.hostname})`);
		}

		const meta = this.isHtml(response) ? await parseHtmlMetadata(response.body) : null;
		if (ACCESS_DENIED_STATUSES.has(response.status) || this.adapter.isAccessBlocked(finalUrl, response.status, meta)) {
			throw new AppError(
				'PROVIDER_ACCESS_DENIED',
				`${this.marketplace} refused automated access (HTTP ${response.status}). Login walls, CAPTCHA and anti-bot checks are not bypassed.`,
				{ details: { finalUrl: response.finalUrl } }
			);
		}
		if (response.status === 404 || response.status === 410) {
			throw new AppError('PRODUCT_NOT_FOUND', 'The product page does not exist or was removed');
		}
		if (response.status >= 400) {
			throw new AppError('EXTRACTION_FAILED', `Marketplace responded with HTTP ${response.status}`);
		}

		const parsedFinal = this.adapter.parseProductUrl(finalUrl);
		const parsedCanonical = this.parseCanonicalCandidate(meta);
		const parsed =
			parsedFinal && parsedCanonical && parsedCanonical.externalProductId === parsedFinal.externalProductId
				? { ...parsedFinal, canonicalUrl: parsedCanonical.canonicalUrl }
				: (parsedFinal ?? parsedCanonical);
		if (!parsed) {
			throw new AppError('INVALID_AFFILIATE_URL', 'The link does not resolve to a product page');
		}

		const candidates: ProductCandidate[] = [];
		for (const source of this.authorizedSources) {
			const c = await source.lookup({
				marketplace: this.marketplace,
				externalProductId: parsed.externalProductId,
				productUrl: parsed.canonicalUrl
			});
			if (c) candidates.push(c);
		}

		const og = meta?.openGraph ?? {};
		const jsonLdNode = meta ? findJsonLdProduct(meta.jsonLd) : null;
		const ld = jsonLdNode ? readJsonLdProduct(jsonLdNode) : null;

		if (meta) {
			candidates.push({
				source: 'open-graph',
				productName: typeof og['og:title'] === 'string' ? this.adapter.cleanTitle(og['og:title']) : undefined,
				productImages: meta.ogImages,
				price: og['product:price:amount'] ?? og['og:price:amount'],
				originalPrice: og['product:original_price:amount'],
				currency: og['product:price:currency'] ?? og['og:price:currency']
			});
		}
		if (ld) {
			candidates.push({
				source: 'json-ld',
				productName: ld.name,
				productImages: ld.images,
				price: ld.price ?? ld.lowPrice,
				originalPrice: ld.highPrice !== undefined && ld.lowPrice !== undefined ? ld.highPrice : undefined,
				currency: ld.currency,
				shopName: ld.sellerName
			});
		}
		if (meta?.title) {
			candidates.push({ source: 'html', productName: this.adapter.cleanTitle(meta.title) });
		}
		candidates.push({ source: 'url', externalProductId: parsed.externalProductId, productName: parsed.slugName });

		const { fields, fieldSources } = mergeCandidates(candidates);

		return {
			marketplace: this.marketplace,
			...fields,
			productUrl: parsed.canonicalUrl,
			affiliateUrl,
			rawData: {
				mode: this.http.mode,
				finalUrl: response.finalUrl,
				redirectChain: response.redirectChain,
				httpStatus: response.status,
				sources: [...new Set(candidates.map((c) => c.source))],
				fieldSources,
				openGraph: og,
				jsonLdProduct: jsonLdNode,
				title: meta?.title ?? null
			},
			extractedAt: new Date()
		};
	}

	private isHtml(res: HttpResponse): boolean {
		const ct = (res.contentType ?? '').toLowerCase();
		return ct === '' || ct.includes('text/html') || ct.includes('application/xhtml');
	}

	private parseCanonicalCandidate(meta: HtmlMetadata | null): ParsedProductUrl | null {
		if (!meta) return null;
		for (const candidate of [meta.canonical, meta.openGraph['og:url']]) {
			const text = normalizeText(candidate, 2048);
			if (!text) continue;
			try {
				const url = new URL(text);
				if (detectMarketplace(url.hostname) !== this.marketplace) continue;
				const parsed = this.adapter.parseProductUrl(url);
				if (parsed) return parsed;
			} catch {
				// ignore malformed canonical URLs
			}
		}
		return null;
	}
}

/** Turns "Some-Product-Name" into "Some Product Name"; returns null for empty/numeric slugs. */
export function slugToName(slug: string | undefined): string | null {
	if (!slug) return null;
	let decoded: string;
	try {
		decoded = decodeURIComponent(slug);
	} catch {
		decoded = slug;
	}
	const name = decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
	if (!name || /^\d+$/.test(name) || name.length < 3) return null;
	return name;
}
