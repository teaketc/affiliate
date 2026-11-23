import type { Marketplace } from '@affiliate/shared';

/**
 * Allowlisted marketplace domains. A host matches when it equals a root domain
 * or is a subdomain of it (e.g. s.shopee.co.th, c.lazada.co.th, www.lazada.co.th).
 * Only these hosts are ever fetched by the backend — including every redirect hop.
 */
export const MARKETPLACE_DOMAINS: Record<Marketplace, { roots: string[]; shortLinkHosts: string[] }> = {
	SHOPEE: {
		roots: [
			'shopee.co.th',
			'shopee.sg',
			'shopee.com.my',
			'shopee.ph',
			'shopee.vn',
			'shopee.co.id',
			'shopee.tw',
			'shopee.com.br',
			'shp.ee',
			'shope.ee'
		],
		shortLinkHosts: ['shp.ee', 'shope.ee']
	},
	LAZADA: {
		roots: ['lazada.co.th', 'lazada.sg', 'lazada.com.my', 'lazada.com.ph', 'lazada.vn', 'lazada.co.id'],
		shortLinkHosts: []
	}
};

/** Region code derived from the marketplace country domain; used to scope product IDs. */
const REGION_SUFFIXES: Array<[string, string]> = [
	['.co.th', 'TH'],
	['.sg', 'SG'],
	['.com.my', 'MY'],
	['.ph', 'PH'],
	['.vn', 'VN'],
	['.co.id', 'ID'],
	['.tw', 'TW'],
	['.com.br', 'BR']
];

function hostMatches(host: string, root: string): boolean {
	return host === root || host.endsWith(`.${root}`);
}

export function normalizeHost(host: string): string {
	return host.toLowerCase().replace(/\.$/, '');
}

export function detectMarketplace(host: string): Marketplace | null {
	const h = normalizeHost(host);
	for (const [marketplace, cfg] of Object.entries(MARKETPLACE_DOMAINS) as Array<
		[Marketplace, (typeof MARKETPLACE_DOMAINS)[Marketplace]]
	>) {
		if (cfg.roots.some((root) => hostMatches(h, root))) return marketplace;
	}
	return null;
}

export function isMarketplaceHost(host: string): boolean {
	return detectMarketplace(host) !== null;
}

export function regionFromHost(host: string): string | null {
	const h = normalizeHost(host);
	for (const [suffix, region] of REGION_SUFFIXES) if (h.endsWith(suffix)) return region;
	return null;
}
