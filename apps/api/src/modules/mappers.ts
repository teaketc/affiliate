import type { ErrorCode, ExtractionLogDTO, ProductDTO } from '@affiliate/shared';
import { ERROR_CODES } from '@affiliate/shared';
import type { ExtractionLog, Prisma, Product } from '@prisma/client';

function decimalToNumber(value: Prisma.Decimal | null): number | null {
	return value === null ? null : value.toNumber();
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function toProductDTO(p: Product): ProductDTO {
	return {
		id: p.id,
		marketplace: p.marketplace,
		externalProductId: p.externalProductId,
		productName: p.productName,
		productImage: p.productImage,
		productImages: jsonStringArray(p.productImages),
		shopName: p.shopName,
		shopType: p.shopType,
		price: decimalToNumber(p.price),
		originalPrice: decimalToNumber(p.originalPrice),
		currency: p.currency,
		productUrl: p.productUrl,
		affiliateUrl: p.affiliateUrl,
		extractedAt: p.extractedAt?.toISOString() ?? null,
		createdAt: p.createdAt.toISOString(),
		updatedAt: p.updatedAt.toISOString()
	};
}

function toErrorCode(value: string | null): ErrorCode | null {
	return ERROR_CODES.find((c) => c === value) ?? null;
}

export function toLogDTO(l: ExtractionLog): ExtractionLogDTO {
	return {
		id: l.id,
		affiliateUrl: l.affiliateUrl,
		marketplace: l.marketplace,
		productId: l.productId,
		status: l.status,
		errorCode: toErrorCode(l.errorCode),
		errorMessage: l.errorMessage,
		createdAt: l.createdAt.toISOString()
	};
}

export function paginate(page: number | undefined, pageSize: number | undefined) {
	const p = Math.max(1, Math.floor(page ?? 1));
	const size = Math.min(100, Math.max(1, Math.floor(pageSize ?? 20)));
	return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
}

export function pageMeta(page: number, pageSize: number, total: number) {
	return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
