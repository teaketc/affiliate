/**
 * Shared contracts between the ElysiaJS API and the SvelteKit dashboard.
 * Keep this file free of runtime dependencies.
 */

export const MARKETPLACES = ['SHOPEE', 'LAZADA'] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const SHOP_TYPES = ['MALL', 'PREFERRED', 'NORMAL'] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

export const EXTRACTION_STATUSES = ['SUCCESS', 'PARTIAL', 'FAILED'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const ERROR_CODES = [
	'INVALID_URL',
	'UNSUPPORTED_MARKETPLACE',
	'INVALID_AFFILIATE_URL',
	'REDIRECT_FAILED',
	'PRODUCT_NOT_FOUND',
	'EXTRACTION_FAILED',
	'PARTIAL_EXTRACTION',
	'PROVIDER_ACCESS_DENIED',
	'RATE_LIMITED',
	'REQUEST_TIMEOUT',
	'DATABASE_ERROR',
	'DUPLICATE_PRODUCT',
	'VALIDATION_ERROR',
	'NOT_FOUND',
	'INTERNAL_ERROR'
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProductDTO {
	id: string;
	marketplace: Marketplace;
	externalProductId: string | null;
	productName: string;
	productImage: string | null;
	productImages: string[];
	shopName: string | null;
	shopType: ShopType | null;
	price: number | null;
	originalPrice: number | null;
	currency: string | null;
	productUrl: string;
	affiliateUrl: string;
	extractedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ProductDetailDTO extends ProductDTO {
	rawData: unknown;
}

export interface ExtractionLogDTO {
	id: string;
	affiliateUrl: string;
	marketplace: Marketplace | null;
	productId: string | null;
	status: ExtractionStatus;
	errorCode: ErrorCode | null;
	errorMessage: string | null;
	createdAt: string;
}

export interface ExtractionLogDetailDTO extends ExtractionLogDTO {
	extractedData: unknown;
	product: ProductDTO | null;
}

export interface ExtractResultDTO extends ProductDTO {
	saved: true;
	duplicate: boolean;
	logId: string;
	missingFields: string[];
}

export interface StatisticsDTO {
	totalProducts: number;
	shopeeProducts: number;
	lazadaProducts: number;
	successfulExtractions: number;
	partialExtractions: number;
	failedExtractions: number;
	totalExtractions: number;
}

export interface PaginationMeta {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

export interface Paginated<T> {
	items: T[];
	pagination: PaginationMeta;
}

export type ResponseStatus = 'success' | 'partial' | 'failed';

export interface ApiSuccess<T> {
	success: true;
	status: Exclude<ResponseStatus, 'failed'>;
	message: string;
	data: T;
}

export interface ApiFailure {
	success: false;
	status: 'failed';
	message: string;
	error: { code: ErrorCode; message: string; details?: unknown };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface UpdateProductInput {
	productName?: string;
	productImage?: string | null;
	productImages?: string[];
	shopName?: string | null;
	shopType?: ShopType | null;
	price?: number | null;
	originalPrice?: number | null;
	currency?: string | null;
	affiliateUrl?: string;
}

/**
 * Returned in error.details.manualEntry when the link resolved to a real product but the
 * marketplace hides its details from logged-out visitors (e.g. Shopee). The user can then
 * complete the product manually via POST /api/v1/products/manual.
 */
export interface ManualEntryContext {
	marketplace: Marketplace;
	externalProductId: string;
	productUrl: string;
	affiliateUrl: string;
}

export interface ManualProductInput {
	affiliateUrl: string;
	productName: string;
	price?: number | null;
	originalPrice?: number | null;
	currency?: string | null;
	productImage?: string | null;
	shopName?: string | null;
	shopType?: ShopType | null;
}

export type SortOrder = 'asc' | 'desc';
