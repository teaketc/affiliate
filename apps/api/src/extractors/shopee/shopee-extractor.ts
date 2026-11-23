import type { HttpClient } from '../http/http-client';
import { MetadataProductExtractor } from '../metadata-extractor';
import type { AuthorizedProductSource } from '../types';
import { shopeeAdapter } from './shopee-adapter';

/**
 * Shopee provider. Supports product URLs (/product/{shop}/{item}, /{slug}-i.{shop}.{item}),
 * affiliate / short links (s.shopee.*, shp.ee, shope.ee) resolved through the SSRF-safe client.
 */
export class ShopeeExtractor extends MetadataProductExtractor {
	constructor(http: HttpClient, authorizedSources: AuthorizedProductSource[] = []) {
		super(shopeeAdapter, http, authorizedSources);
	}
}
