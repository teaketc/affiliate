import type { StatisticsDTO } from '@affiliate/shared';
import type { PrismaClient } from '@prisma/client';
import { Elysia } from 'elysia';
import { ok } from '../../lib/response';

export async function getStatistics(prisma: PrismaClient): Promise<StatisticsDTO> {
	const [shopee, lazada, success, partial, failed] = await prisma.$transaction([
		prisma.product.count({ where: { marketplace: 'SHOPEE' } }),
		prisma.product.count({ where: { marketplace: 'LAZADA' } }),
		prisma.extractionLog.count({ where: { status: 'SUCCESS' } }),
		prisma.extractionLog.count({ where: { status: 'PARTIAL' } }),
		prisma.extractionLog.count({ where: { status: 'FAILED' } })
	]);
	return {
		totalProducts: shopee + lazada,
		shopeeProducts: shopee,
		lazadaProducts: lazada,
		successfulExtractions: success,
		partialExtractions: partial,
		failedExtractions: failed,
		totalExtractions: success + partial + failed
	};
}

export function statisticsController(prisma: PrismaClient) {
	return new Elysia({ prefix: '/api/v1', tags: ['Statistics'] }).get('/statistics', async () => ok(await getStatistics(prisma)), {
		detail: { summary: 'Dashboard statistics' }
	});
}
