import type { ErrorCode } from '@affiliate/shared';

const HTTP_STATUS: Record<ErrorCode, number> = {
	INVALID_URL: 400,
	UNSUPPORTED_MARKETPLACE: 400,
	INVALID_AFFILIATE_URL: 400,
	REDIRECT_FAILED: 502,
	PRODUCT_NOT_FOUND: 404,
	EXTRACTION_FAILED: 422,
	PARTIAL_EXTRACTION: 200,
	PROVIDER_ACCESS_DENIED: 502,
	RATE_LIMITED: 429,
	REQUEST_TIMEOUT: 504,
	DATABASE_ERROR: 500,
	DUPLICATE_PRODUCT: 409,
	VALIDATION_ERROR: 400,
	NOT_FOUND: 404,
	INTERNAL_ERROR: 500
};

export class AppError extends Error {
	readonly code: ErrorCode;
	readonly httpStatus: number;
	readonly details: unknown;

	constructor(code: ErrorCode, message: string, options: { details?: unknown; cause?: unknown } = {}) {
		super(message, { cause: options.cause });
		this.name = 'AppError';
		this.code = code;
		this.httpStatus = HTTP_STATUS[code];
		this.details = options.details;
	}
}

export function isAppError(value: unknown): value is AppError {
	return value instanceof AppError;
}
