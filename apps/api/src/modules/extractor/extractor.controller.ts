import { Elysia, t } from 'elysia';
import { ShopTypeSchema } from '../schemas';
import { AppError } from '../../lib/errors';
import { fail, ok } from '../../lib/response';
import type { Logger } from '../../lib/logger';
import type { RateLimiter } from '../../security/rate-limit';
import type { ExtractOutcome, ExtractorService } from './extractor.service';
import type { Server } from 'elysia/universal';

export function extractorController(service: ExtractorService, limiter: RateLimiter, trustProxy: boolean, logger: Logger) {
	/** Returns a 429 response body when the client exceeded the extraction rate limit. */
	function rateLimited(request: Request, server: Server | null, set: { status?: number | string; headers: Record<string, string | number> }) {
		const forwarded = trustProxy ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
		const clientIp = forwarded || server?.requestIP(request)?.address || 'unknown';
		const limit = limiter.consume(`extract:${clientIp}`);
		if (limit.allowed) return null;
		set.status = 429;
		set.headers['retry-after'] = String(Math.ceil(limit.retryAfterMs / 1000));
		logger.warn('extraction.rate_limited', { clientIp });
		const err = new AppError('RATE_LIMITED', 'Too many extraction requests, try again later');
		return fail(err.code, 'Unable to extract product', err.message);
	}

	function failure(outcome: Extract<ExtractOutcome, { ok: false }>, set: { status?: number | string }, message: string) {
		set.status = outcome.error.httpStatus;
		const extra = typeof outcome.error.details === 'object' && outcome.error.details !== null ? outcome.error.details : {};
		const manualEntry = 'manualEntry' in extra ? extra.manualEntry : undefined;
		return fail(outcome.error.code, message, outcome.error.message, manualEntry ? { logId: outcome.logId, manualEntry } : { logId: outcome.logId });
	}

	return new Elysia({ prefix: '/api/v1', tags: ['Extractor'] }).post(
		'/extractor',
		async ({ body, set, request, server }) => {
			const limited = rateLimited(request, server, set);
			if (limited) return limited;

			const outcome = await service.extract(body.affiliateUrl);
			if (!outcome.ok) return failure(outcome, set, 'Unable to extract product');
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
	)
	.post(
		'/products/manual',
		async ({ body, set, request, server }) => {
			const limited = rateLimited(request, server, set);
			if (limited) return limited;

			const outcome = await service.saveManual(body);
			if (!outcome.ok) return failure(outcome, set, 'Unable to save product');
			set.status = outcome.result.duplicate ? 200 : 201;
			return ok(outcome.result, 'Product saved with manually entered details', 'partial');
		},
		{
			body: t.Object({
				affiliateUrl: t.String({ minLength: 1, maxLength: 2048 }),
				productName: t.String({ minLength: 1, maxLength: 500 }),
				price: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 9_999_999_999.99 }), t.Null()])),
				originalPrice: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 9_999_999_999.99 }), t.Null()])),
				currency: t.Optional(t.Union([t.String({ pattern: '^[A-Za-z]{3}$' }), t.Null()])),
				productImage: t.Optional(t.Union([t.String({ maxLength: 2048 }), t.Null()])),
				shopName: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
				shopType: t.Optional(t.Union([ShopTypeSchema, t.Null()]))
			}),
			detail: {
				summary: 'Save a product with manually entered details',
				description:
					'For links that resolve to a real product whose page is hidden from logged-out visitors (e.g. Shopee). The link is re-resolved server-side so marketplace, product ID and canonical URL are verified; only descriptive fields come from the request. Saved with PARTIAL status and the manual fields recorded in raw_data.'
			}
		}
	);
}
