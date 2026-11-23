import type { HttpClient } from '../http/http-client';
import { MetadataProductExtractor } from '../metadata-extractor';
import type { AuthorizedProductSource } from '../types';
import { lazadaAdapter } from './lazada-adapter';

/**
 * Lazada provider. Supports product URLs (/products/{slug}-i{item}-s{sku}.html) and
 * affiliate / short links on lazada subdomains (s.lazada.*, c.lazada.*) resolved safely.
 */
export class LazadaExtractor extends MetadataProductExtractor {
	constructor(http: HttpClient, authorizedSources: AuthorizedProductSource[] = []) {
		super(lazadaAdapter, http, authorizedSources);
	}
}
