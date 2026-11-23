import type { ApiFailure, ApiSuccess, ErrorCode } from '@affiliate/shared';

export function ok<T>(data: T, message = 'OK', status: 'success' | 'partial' = 'success'): ApiSuccess<T> {
	return { success: true, status, message, data };
}

export function fail(code: ErrorCode, message: string, errorMessage: string, details?: unknown): ApiFailure {
	const error: ApiFailure['error'] = { code, message: errorMessage };
	if (details !== undefined) error.details = details;
	return { success: false, status: 'failed', message, error };
}
