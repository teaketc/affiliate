import { regionFromHost } from '../../security/marketplaces';
import { slugToName, type MarketplaceAdapter, type ParsedProductUrl } from '../metadata-extractor';
import type { HtmlMetadata } from '../sources/html-metadata';

// /products/{slug}-i{itemId}(-s{skuId}).html  or  /products/i{itemId}.html
const PRODUCT_PATH = /^\/products\/(?:(.*?)-)?i(\d{1,20})(?:-s(\d{1,20}))?\.html\/?$/i;

const BLOCKED_PATHS = [/_____tmd_____/, /\/punish/i, /captcha/i, /^\/(customer\/)?user\/login/i];
const SITE_TITLES = /^lazada(\.co\.th|\.sg|\.com\.my|\.com\.ph|\.vn|\.co\.id)?$/i;
const TITLE_SUFFIX = /\s*[|｜]\s*lazada[^|｜]*$/i;

export const lazadaAdapter: MarketplaceAdapter = {
	marketplace: 'LAZADA',

	parseProductUrl(url: URL): ParsedProductUrl | null {
		const m = PRODUCT_PATH.exec(url.pathname);
		const itemId = m?.[2];
		if (!m || !itemId) return null;
		const host = url.hostname.toLowerCase();
		const region = regionFromHost(host) ?? 'XX';
		// Keep the real path the marketplace served (minus query/hash); IDs come from the path.
		return {
			externalProductId: `${region}:${itemId}`,
			canonicalUrl: `https://${host}${url.pathname}`,
			slugName: slugToName(m[1])
		};
	},

	isAccessBlocked(finalUrl: URL, _status: number, meta: HtmlMetadata | null): boolean {
		if (BLOCKED_PATHS.some((re) => re.test(finalUrl.pathname))) return true;
		const title = meta?.title ?? '';
		return /captcha|slide to verify|punish/i.test(title);
	},

	cleanTitle(title: string): string {
		const cleaned = title.replace(TITLE_SUFFIX, '').trim();
		return SITE_TITLES.test(cleaned) ? '' : cleaned;
	}
};
