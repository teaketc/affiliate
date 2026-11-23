import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { Prisma, type PrismaClient } from '@prisma/client';
import { Elysia } from 'elysia';
import type { AppConfig } from './config/env';
import type { ExtractorRegistry } from './extractors/registry';
import { AppError } from './lib/errors';
import type { Logger } from './lib/logger';
import { fail } from './lib/response';
import { extractionLogController } from './modules/extraction-logs/extraction-log.controller';
import { ExtractionLogRepository } from './modules/extraction-logs/extraction-log.repository';
import { extractorController } from './modules/extractor/extractor.controller';
import { ExtractorService } from './modules/extractor/extractor.service';
import { healthController } from './modules/health/health.controller';
import { productController } from './modules/products/product.controller';
import { ProductRepository } from './modules/products/product.repository';
import { ProductService } from './modules/products/product.service';
import { statisticsController } from './modules/statistics/statistics.controller';
import type { RateLimiter } from './security/rate-limit';

export interface AppDeps {
	config: Pick<AppConfig, 'corsOrigins' | 'trustProxy' | 'nodeEnv'>;
	prisma: PrismaClient;
	registry: ExtractorRegistry;
	rateLimiter: RateLimiter;
	logger: Logger;
}

export function createApp(deps: AppDeps) {
	const { prisma, logger } = deps;
	const productRepo = new ProductRepository(prisma);
	const logRepo = new ExtractionLogRepository(prisma);
	const extractorService = new ExtractorService(prisma, deps.registry, productRepo, logRepo, logger);
	const productService = new ProductService(productRepo);

	return new Elysia()
		.use(
			cors({
				origin: deps.config.corsOrigins,
				methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
				allowedHeaders: ['content-type', 'x-request-id']
			})
		)
		.use(
			swagger({
				path: '/swagger',
				documentation: {
					info: {
						title: 'Affiliate Product Extractor API',
						version: '1.0.0',
						description: 'Paste a Shopee / Lazada affiliate URL → product is extracted and auto-saved to PostgreSQL.'
					},
					tags: [
						{ name: 'Extractor', description: 'Extract + auto-save' },
						{ name: 'Products', description: 'Product management' },
						{ name: 'Extraction Logs', description: 'Audit trail of every extraction request' },
						{ name: 'Statistics', description: 'Dashboard counters' },
						{ name: 'Health', description: 'Probes' }
					]
				}
			})
		)
		.derive({ as: 'global' }, ({ request }) => ({
			requestId: request.headers.get('x-request-id')?.slice(0, 64) || crypto.randomUUID(),
			startedAt: performance.now()
		}))
		.onAfterHandle({ as: 'global' }, ({ set, requestId }) => {
			set.headers['x-request-id'] = requestId;
		})
		.onAfterResponse({ as: 'global' }, ({ request, set, requestId, startedAt }) => {
			logger.info('http.request', {
				requestId,
				method: request.method,
				path: new URL(request.url).pathname,
				status: typeof set.status === 'number' ? set.status : 200,
				durationMs: startedAt ? Math.round(performance.now() - startedAt) : undefined
			});
		})
		.onError({ as: 'global' }, ({ code, error, set }) => {
			if (error instanceof AppError) {
				set.status = error.httpStatus;
				return fail(error.code, error.message, error.message, error.details);
			}
			if (code === 'VALIDATION') {
				set.status = 400;
				return fail('VALIDATION_ERROR', 'Invalid request', error.message.slice(0, 2000));
			}
			if (code === 'NOT_FOUND') {
				set.status = 404;
				return fail('NOT_FOUND', 'Route not found', 'The requested resource does not exist');
			}
			if (code === 'PARSE') {
				set.status = 400;
				return fail('VALIDATION_ERROR', 'Invalid request body', 'Request body could not be parsed');
			}
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === 'P2025') {
					set.status = 404;
					return fail('NOT_FOUND', 'Resource not found', 'The requested record does not exist');
				}
				if (error.code === 'P2002') {
					set.status = 409;
					return fail('DUPLICATE_PRODUCT', 'Duplicate record', 'A product with the same identifiers already exists');
				}
				logger.error('db.error', { code: error.code, error });
				set.status = 500;
				return fail('DATABASE_ERROR', 'Database error', 'A database error occurred');
			}
			logger.error('http.unhandled_error', { code, error });
			set.status = 500;
			return fail('INTERNAL_ERROR', 'Internal server error', 'An unexpected error occurred');
		})
		.use(healthController(prisma))
		.use(extractorController(extractorService, deps.rateLimiter, deps.config.trustProxy, logger))
		.use(productController(productService))
		.use(extractionLogController(logRepo))
		.use(statisticsController(prisma));
}

export type App = ReturnType<typeof createApp>;
