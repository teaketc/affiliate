import { env } from '$env/dynamic/public';
import type {
	ApiFailure,
	ApiResponse,
	ExtractionLogDetailDTO,
	ExtractionLogDTO,
	ExtractionStatus,
	ExtractResultDTO,
	ManualEntryContext,
	ManualProductInput,
	Marketplace,
	Paginated,
	ProductDetailDTO,
	ProductDTO,
	ShopType,
	StatisticsDTO,
	UpdateProductInput
} from '@affiliate/shared';

const BASE = (env.PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly httpStatus: number,
		readonly details: unknown = undefined
	) {
		super(message);
	}

	/** Present when the link is a real product whose details the marketplace hides (e.g. Shopee). */
	get manualEntry(): ManualEntryContext | null {
		const d = this.details;
		if (typeof d !== 'object' || d === null || !('manualEntry' in d)) return null;
		const m = (d as { manualEntry: unknown }).manualEntry;
		if (typeof m !== 'object' || m === null) return null;
		const c = m as Record<string, unknown>;
		return typeof c.productUrl === 'string' && typeof c.affiliateUrl === 'string' && typeof c.externalProductId === 'string' &&
			(c.marketplace === 'SHOPEE' || c.marketplace === 'LAZADA')
			? { marketplace: c.marketplace, productUrl: c.productUrl, affiliateUrl: c.affiliateUrl, externalProductId: c.externalProductId }
			: null;
	}
}

async function request<T>(method: string, path: string, body?: unknown): Promise<{ status: 'success' | 'partial'; message: string; data: T }> {
	let res: Response;
	try {
		res = await fetch(`${BASE}${path}`, {
			method,
			headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
			body: body !== undefined ? JSON.stringify(body) : undefined
		});
	} catch {
		throw new ApiError('NETWORK_ERROR', 'ไม่สามารถเชื่อมต่อ API ได้ (Cannot reach API)', 0);
	}
	let json: ApiResponse<T>;
	try {
		json = (await res.json()) as ApiResponse<T>;
	} catch {
		throw new ApiError('INVALID_RESPONSE', `Unexpected response (HTTP ${res.status})`, res.status);
	}
	if (!json.success) {
		const f = json as ApiFailure;
		throw new ApiError(f.error.code, f.error.message, res.status, f.error.details);
	}
	return { status: json.status, message: json.message, data: json.data };
}

function qs(params: Record<string, string | number | undefined | null>): string {
	const s = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
	const out = s.toString();
	return out ? `?${out}` : '';
}

export interface ProductQuery {
	page?: number;
	pageSize?: number;
	search?: string;
	marketplace?: Marketplace | '';
	shopType?: ShopType | '';
	sortBy?: 'createdAt' | 'updatedAt' | 'price' | 'productName';
	order?: 'asc' | 'desc';
}

export interface LogQuery {
	page?: number;
	pageSize?: number;
	search?: string;
	marketplace?: Marketplace | '';
	status?: ExtractionStatus | '';
}

export const api = {
	extract: (affiliateUrl: string) => request<ExtractResultDTO>('POST', '/api/v1/extractor', { affiliateUrl }),
	saveManual: (input: ManualProductInput) => request<ExtractResultDTO>('POST', '/api/v1/products/manual', input),
	products: (q: ProductQuery = {}) => request<Paginated<ProductDTO>>('GET', `/api/v1/products${qs({ ...q })}`).then((r) => r.data),
	product: (id: string) => request<ProductDetailDTO>('GET', `/api/v1/products/${id}`).then((r) => r.data),
	updateProduct: (id: string, input: UpdateProductInput) => request<ProductDTO>('PATCH', `/api/v1/products/${id}`, input).then((r) => r.data),
	deleteProduct: (id: string) => request<{ id: string; deleted: true }>('DELETE', `/api/v1/products/${id}`).then((r) => r.data),
	logs: (q: LogQuery = {}) => request<Paginated<ExtractionLogDTO>>('GET', `/api/v1/extraction-logs${qs({ ...q })}`).then((r) => r.data),
	log: (id: string) => request<ExtractionLogDetailDTO>('GET', `/api/v1/extraction-logs/${id}`).then((r) => r.data),
	statistics: () => request<StatisticsDTO>('GET', '/api/v1/statistics').then((r) => r.data)
};

export function errorMessage(e: unknown): string {
	if (e instanceof ApiError) return `${e.message} (${e.code})`;
	if (e instanceof Error) return e.message;
	return 'Unknown error';
}
