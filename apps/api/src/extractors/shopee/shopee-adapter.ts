import { regionFromHost } from '../../security/marketplaces';
import { slugToName, type MarketplaceAdapter, type ParsedProductUrl } from '../metadata-extractor';
import type { HtmlMetadata } from '../sources/html-metadata';

// /product/{shopId}/{itemId}  and  /opaanlp/{shopId}/{itemId} (target of s.shopee.* affiliate short links)
const PRODUCT_PATH = /^\/(?:product|opaanlp)\/(\d{1,20})\/(\d{1,20})\/?$/;
// /{slug}-i.{shopId}.{itemId}
const SLUG_PATH = /^\/(?:(.*?)-)?i\.(\d{1,20})\.(\d{1,20})\/?$/;
// /universal-link/<original path> (app deep-link wrapper)
const UNIVERSAL_PREFIX = /^\/universal-link(\/.*)$/;

const BLOCKED_PATHS = [/^\/verify\//, /^\/buyer\/login/, /^\/login/, /captcha/i, /anti[-_]?bot/i];
const SITE_TITLES = /^shopee(\s+(thailand|singapore|malaysia|philippines|vietnam|indonesia|taiwan|brasil|brazil))?$/i;
const TITLE_SUFFIX = /\s*[|｜-]\s*shopee[^|｜]*$/i;

function isEmptyShell(meta: HtmlMetadata): boolean {
	return !meta.title && Object.keys(meta.openGraph).length === 0 && meta.jsonLd.length === 0;
}

export const shopeeAdapter: MarketplaceAdapter = {
	marketplace: 'SHOPEE',

	parseProductUrl(url: URL): ParsedProductUrl | null {
		let path = url.pathname;
		const universal = UNIVERSAL_PREFIX.exec(path);
		if (universal?.[1]) path = universal[1];

		let shopId: string | undefined;
		let itemId: string | undefined;
		let slug: string | undefined;
		const p = PRODUCT_PATH.exec(path);
		if (p) {
			shopId = p[1];
			itemId = p[2];
		} else {
			const s = SLUG_PATH.exec(path);
			if (s) {
				slug = s[1];
				shopId = s[2];
				itemId = s[3];
			}
		}
		if (!shopId || !itemId) return null;

		const host = url.hostname.toLowerCase();
		const region = regionFromHost(host) ?? 'XX';
		return {
			externalProductId: `${region}:${shopId}.${itemId}`,
			canonicalUrl: `https://${host}/product/${shopId}/${itemId}`,
			slugName: slugToName(slug)
		};
	},

	isAccessBlocked(finalUrl: URL, _status: number, meta: HtmlMetadata | null): boolean {
		if (BLOCKED_PATHS.some((re) => re.test(finalUrl.pathname))) return true;
		const title = meta?.title ?? '';
		if (/captcha|verify|traffic/i.test(title)) return true;
		// Shopee serves logged-out visitors an empty JavaScript shell (no <title>, Open Graph or
		// JSON-LD) whose script then redirects to /verify/traffic/error ("login required").
		// A product page with no metadata at all is therefore treated as that login wall.
		return meta !== null && isEmptyShell(meta);
	},

	cleanTitle(title: string): string {
		const cleaned = title.replace(TITLE_SUFFIX, '').trim();
		return SITE_TITLES.test(cleaned) ? '' : cleaned;
	}
};
