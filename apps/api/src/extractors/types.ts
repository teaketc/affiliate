import type { Marketplace, ShopType } from '@affiliate/shared';

/** Where a field value came from, in the priority order of the extraction strategy. */
export type DataSourceName = 'official-api' | 'open-graph' | 'json-ld' | 'html' | 'url';

/** Raw, un-normalised candidate values produced by one data source. */
export interface ProductCandidate {
	source: DataSourceName;
	productName?: unknown;
	productImage?: unknown;
	productImages?: unknown;
	shopName?: unknown;
	shopType?: ShopType | null;
	price?: unknown;
	originalPrice?: unknown;
	currency?: unknown;
	canonicalUrl?: unknown;
	externalProductId?: unknown;
}

export interface ExtractedProduct {
	marketplace: Marketplace;
	productName: string | null;
	/** Canonical product URL (no tracking params). */
	productUrl: string;
	affiliateUrl: string;
	externalProductId: string | null;
	productImage: string | null;
	productImages: string[];
	shopName: string | null;
	shopType: ShopType | null;
	price: number | null;
	originalPrice: number | null;
	currency: string | null;
	rawData: ExtractionRawData;
	extractedAt: Date;
}

export interface ExtractionRawData {
	mode: 'live' | 'mock';
	finalUrl: string;
	redirectChain: string[];
	httpStatus: number;
	sources: DataSourceName[];
	fieldSources: Partial<Record<keyof ProductFields, DataSourceName>>;
	openGraph: Record<string, string>;
	jsonLdProduct: unknown;
	title: string | null;
}

export type ProductFields = Pick<
	ExtractedProduct,
	| 'productName'
	| 'productImage'
	| 'productImages'
	| 'shopName'
	| 'shopType'
	| 'price'
	| 'originalPrice'
	| 'currency'
	| 'externalProductId'
>;

/** The central provider contract. Each marketplace supplies its own implementation. */
export interface ProductExtractor {
	readonly marketplace: Marketplace;
	extract(url: string): Promise<ExtractedProduct>;
}

/**
 * Optional authorised data source (e.g. an official affiliate API) that runs
 * before page metadata. Return null when the product is not available from it.
 * No implementation ships by default because official API access requires
 * partner credentials and documentation that must be verified first.
 */
export interface AuthorizedProductSource {
	readonly name: 'official-api';
	lookup(input: { marketplace: Marketplace; externalProductId: string | null; productUrl: string }): Promise<ProductCandidate | null>;
}
