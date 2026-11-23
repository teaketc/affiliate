import type { Marketplace } from '@affiliate/shared';
import type { HttpClient } from './http/http-client';
import { LazadaExtractor } from './lazada/lazada-extractor';
import { ShopeeExtractor } from './shopee/shopee-extractor';
import type { ProductExtractor } from './types';

export class ExtractorRegistry {
	private readonly extractors = new Map<Marketplace, ProductExtractor>();

	register(extractor: ProductExtractor): this {
		this.extractors.set(extractor.marketplace, extractor);
		return this;
	}

	get(marketplace: Marketplace): ProductExtractor | null {
		return this.extractors.get(marketplace) ?? null;
	}
}

export function createDefaultRegistry(http: HttpClient): ExtractorRegistry {
	return new ExtractorRegistry().register(new ShopeeExtractor(http)).register(new LazadaExtractor(http));
}
