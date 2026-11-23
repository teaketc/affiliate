import { Elysia, t } from 'elysia';
import { AppError } from '../../lib/errors';
import { ok } from '../../lib/response';
import { pageMeta, paginate, toLogDTO, toProductDTO } from '../mappers';
import { IdParams, MarketplaceSchema, PaginationQuery, StatusSchema } from '../schemas';
import type { ExtractionLogRepository } from './extraction-log.repository';

export function extractionLogController(repo: ExtractionLogRepository) {
	return new Elysia({ prefix: '/api/v1/extraction-logs', tags: ['Extraction Logs'] })
		.get(
			'/',
			async ({ query }) => {
				const { page, pageSize, skip, take } = paginate(query.page, query.pageSize);
				const { items, total } = await repo.list({
					skip,
					take,
					status: query.status,
					marketplace: query.marketplace,
					productId: query.productId,
					search: query.search?.trim().slice(0, 200) || undefined
				});
				return ok({ items: items.map(toLogDTO), pagination: pageMeta(page, pageSize, total) });
			},
			{
				query: t.Object({
					...PaginationQuery,
					status: t.Optional(StatusSchema),
					marketplace: t.Optional(MarketplaceSchema),
					productId: t.Optional(t.String({ format: 'uuid' })),
					search: t.Optional(t.String({ maxLength: 200 }))
				}),
				detail: { summary: 'Extraction history (newest first)' }
			}
		)
		.get(
			'/:id',
			async ({ params }) => {
				const log = await repo.findById(params.id);
				if (!log) throw new AppError('NOT_FOUND', 'Extraction log not found');
				return ok({ ...toLogDTO(log), extractedData: log.extractedData, product: log.product ? toProductDTO(log.product) : null });
			},
			{ params: IdParams, detail: { summary: 'Extraction log detail' } }
		);
}
