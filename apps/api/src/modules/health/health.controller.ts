import type { PrismaClient } from '@prisma/client';
import { Elysia } from 'elysia';

export function healthController(prisma: PrismaClient) {
	return new Elysia({ tags: ['Health'] })
		.get('/health', () => ({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }), {
			detail: { summary: 'Liveness probe' }
		})
		.get(
			'/ready',
			async ({ set }) => {
				try {
					await prisma.$queryRaw`SELECT 1`;
					return { status: 'ready', database: 'ok' };
				} catch {
					set.status = 503;
					return { status: 'not_ready', database: 'unreachable' };
				}
			},
			{ detail: { summary: 'Readiness probe (checks PostgreSQL)' } }
		);
}
