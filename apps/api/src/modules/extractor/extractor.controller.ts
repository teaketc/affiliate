import { Elysia, t } from 'elysia';
import { AppError } from '../../lib/errors';
import { fail, ok } from '../../lib/response';
import type { Logger } from '../../lib/logger';
import type { RateLimiter } from '../../security/rate-limit';
import type { ExtractorService } from './extractor.service';

export function extractorController(service: ExtractorService, limiter: RateLimiter, trustProxy: boolean, logger: Logger) {
	return new Elysia({ prefix: '/api/v1', tags: ['Extractor'] }).post(
		'/extractor',
		async ({ body, set, request, server }) => {
			const forwarded = trustProxy ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
			const clientIp = forwarded || server?.requestIP(request)?.address || 'unknown';
			const limit = limiter.consume(`extract:${clientIp}`);
			if (!limit.allowed) {
				set.status = 429;
				set.headers['retry-after'] = String(Math.ceil(limit.retryAfterMs / 1000));
				logger.warn('extraction.rate_limited', { clientIp });
				const err = new AppError('RATE_LIMITED', 'Too many extraction requests, try again later');
				return fail(err.code, 'Unable to extract product', err.message);
			}

			const outcome = await service.extract(body.affiliateUrl);
			if (!outcome.ok) {
				set.status = outcome.error.httpStatus;
				return fail(outcome.error.code, 'Unable to extract product', outcome.error.message, { logId: outcome.logId });
			}
			set.status = outcome.result.duplicate ? 200 : 201;
			return outcome.status === 'SUCCESS'
				? ok(outcome.result, outcome.result.duplicate ? 'Product extracted and updated (duplicate)' : 'Product extracted and saved')
				: ok(outcome.result, 'Product partially extracted and saved', 'partial');
		},
		{
			body: t.Object({ affiliateUrl: t.String({ minLength: 1, maxLength: 2048, description: 'Shopee or Lazada product / affiliate / short URL' }) }),
			detail: {
				summary: 'Extract a product from an affiliate URL and save it automatically',
				description:
					'Validates the URL against the marketplace allowlist, safely resolves redirects, extracts Open Graph / JSON-LD metadata, deduplicates and saves. Every call writes an extraction log.'
			}
		}
	);
}
