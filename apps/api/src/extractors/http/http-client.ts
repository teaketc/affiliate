import type { AppConfig } from '../../config/env';
import { isMarketplaceHost } from '../../security/marketplaces';
import { safeFetch, type DnsResolver, type Transport } from '../../security/safe-fetch';

export interface HttpResponse {
	finalUrl: string;
	status: number;
	contentType: string | null;
	body: string;
	redirectChain: string[];
}

export interface HttpClient {
	readonly mode: 'live' | 'mock';
	get(url: string): Promise<HttpResponse>;
}

/** Live client: every request goes through the SSRF-safe fetcher with the marketplace allowlist. */
export class SafeHttpClient implements HttpClient {
	readonly mode = 'live' as const;

	constructor(
		private readonly fetchConfig: AppConfig['fetch'],
		private readonly deps: { resolver?: DnsResolver; transport?: Transport } = {}
	) {}

	get(url: string): Promise<HttpResponse> {
		return safeFetch(url, { ...this.fetchConfig, isAllowedHost: isMarketplaceHost }, this.deps);
	}
}
