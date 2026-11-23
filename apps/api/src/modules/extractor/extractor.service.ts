import type { ExtractResultDTO, ExtractionStatus, Marketplace } from '@affiliate/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { ExtractorRegistry } from '../../extractors/registry';
import type { ExtractedProduct } from '../../extractors/types';
import { AppError, isAppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { validateAffiliateUrl } from '../../security/url-guard';
import type { ExtractionLogRepository } from '../extraction-logs/extraction-log.repository';
import { toProductDTO } from '../mappers';
import type { ProductRepository } from '../products/product.repository';

export type ExtractOutcome =
	| { ok: true; status: Exclude<ExtractionStatus, 'FAILED'>; result: ExtractResultDTO }
	| { ok: false; error: AppError; logId: string | null };

const MAX_TX_ATTEMPTS = 3;

/** Fields whose absence downgrades a save to PARTIAL. */
function missingFields(p: ExtractedProduct): string[] {
	const missing: string[] = [];
	if (p.price === null) missing.push('price');
	if (p.productImage === null) missing.push('productImage');
	if (p.rawData.fieldSources.productName === 'url') missing.push('verifiedProductName');
	return missing;
}

function isUniqueViolation(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Orchestrates: validate → detect marketplace → extract → normalise → dedupe →
 * auto-save (single transaction with the log) → respond. Every request produces
 * an extraction_logs row, including failures.
 */
export class ExtractorService {
	constructor(
		private readonly prisma: PrismaClient,
		private readonly registry: ExtractorRegistry,
		private readonly products: ProductRepository,
		private readonly logs: ExtractionLogRepository,
		private readonly logger: Logger
	) {}

	async extract(rawUrl: string): Promise<ExtractOutcome> {
		const affiliateUrl = rawUrl.trim().slice(0, 2048);
		let marketplace: Marketplace | null = null;
		let stage = 'validate';
		const started = performance.now();

		try {
			const validated = validateAffiliateUrl(rawUrl);
			marketplace = validated.marketplace;

			stage = 'extract';
			const extractor = this.registry.get(marketplace);
			if (!extractor) throw new AppError('UNSUPPORTED_MARKETPLACE', `No extractor registered for ${marketplace}`);
			const extracted = await extractor.extract(validated.url.toString());

			stage = 'normalize';
			if (!extracted.productName) {
				throw new AppError('EXTRACTION_FAILED', 'Product information unavailable: no verifiable product name', {
					details: { productUrl: extracted.productUrl }
				});
			}
			const product = { ...extracted, productName: extracted.productName };
			const missing = missingFields(product);
			const status: Exclude<ExtractionStatus, 'FAILED'> = missing.length === 0 ? 'SUCCESS' : 'PARTIAL';

			stage = 'save';
			const saved = await this.saveWithRetry(product, status, missing);
			this.logger.info('extraction.saved', {
				marketplace,
				status,
				productId: saved.product.id,
				duplicate: saved.duplicate,
				durationMs: Math.round(performance.now() - started)
			});
			return {
				ok: true,
				status,
				result: { ...toProductDTO(saved.product), saved: true, duplicate: saved.duplicate, logId: saved.logId, missingFields: missing }
			};
		} catch (cause) {
			const error = this.toAppError(cause, stage);
			this.logger.warn('extraction.failed', {
				marketplace,
				stage,
				code: error.code,
				message: error.message,
				durationMs: Math.round(performance.now() - started),
				cause: error.cause
			});
			const logId = await this.writeFailedLog(affiliateUrl, marketplace, error, stage);
			return { ok: false, error, logId };
		}
	}

	private async saveWithRetry(product: ExtractedProduct & { productName: string }, status: ExtractionStatus, missing: string[]) {
		for (let attempt = 1; ; attempt++) {
			try {
				return await this.prisma.$transaction(async (tx) => {
					const { product: row, duplicate } = await this.products.upsertExtracted(tx, product);
					const log = await this.logs.create(
						{
							affiliateUrl: product.affiliateUrl,
							marketplace: product.marketplace,
							productId: row.id,
							status,
							errorCode: status === 'PARTIAL' ? 'PARTIAL_EXTRACTION' : null,
							errorMessage: status === 'PARTIAL' ? `Missing fields: ${missing.join(', ')}` : null,
							extractedData: {
								duplicate,
								missingFields: missing,
								product: {
									productName: product.productName,
									productUrl: product.productUrl,
									externalProductId: product.externalProductId,
									productImage: product.productImage,
									productImages: product.productImages,
									shopName: product.shopName,
									shopType: product.shopType,
									price: product.price,
									originalPrice: product.originalPrice,
									currency: product.currency
								},
								raw: product.rawData as unknown as Prisma.InputJsonValue
							}
						},
						tx
					);
					return { product: row, duplicate, logId: log.id };
				});
			} catch (error) {
				// Concurrent insert of the same product hit the unique constraint: retry so the
				// second request takes the "duplicate → update" path.
				if (isUniqueViolation(error) && attempt < MAX_TX_ATTEMPTS) continue;
				if (isUniqueViolation(error)) {
					throw new AppError('DUPLICATE_PRODUCT', 'Product conflicts with an existing record', { cause: error });
				}
				throw error;
			}
		}
	}

	private toAppError(cause: unknown, stage: string): AppError {
		if (isAppError(cause)) return cause;
		if (cause instanceof Prisma.PrismaClientKnownRequestError || cause instanceof Prisma.PrismaClientInitializationError) {
			return new AppError('DATABASE_ERROR', 'Database operation failed', { cause });
		}
		if (cause instanceof Prisma.PrismaClientUnknownRequestError || cause instanceof Prisma.PrismaClientRustPanicError) {
			return new AppError('DATABASE_ERROR', 'Database operation failed', { cause });
		}
		return new AppError('EXTRACTION_FAILED', `Unexpected error during ${stage}`, { cause });
	}

	private async writeFailedLog(affiliateUrl: string, marketplace: Marketplace | null, error: AppError, stage: string) {
		try {
			const log = await this.logs.create({
				affiliateUrl,
				marketplace,
				productId: null,
				status: 'FAILED',
				errorCode: error.code,
				errorMessage: error.message,
				extractedData: { stage, details: (error.details ?? null) as Prisma.InputJsonValue }
			});
			return log.id;
		} catch (logError) {
			this.logger.error('extraction.log_write_failed', { error: logError });
			return null;
		}
	}
}
