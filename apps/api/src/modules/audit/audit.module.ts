import { Elysia, t } from 'elysia';
import type { Prisma, PrismaClient } from '@prisma/client';
import { AuditLogDto, Paginated, totalPages, type AuditLogDto as AuditLogDtoT, type PaginatedResult, QueryInt } from '@affiliate/shared';
import { iso } from '../../lib/prisma';
import type { Logger } from '../../lib/logger';
import { authPlugin } from '../../plugins/auth';
import type { AuditContext } from '../../plugins/request-context';
import type { AuthService } from '../auth/auth.service';

export interface AuditWriter {
  write(entry: { ctx: AuditContext; method: string; path: string; status: number }): void;
}

/** Persists one api_logs row per /api request, fire-and-forget so it never slows responses. */
export class AuditService implements AuditWriter {
  constructor(
    private readonly db: PrismaClient,
    private readonly log: Logger
  ) {}

  write({ ctx, method, path, status }: { ctx: AuditContext; method: string; path: string; status: number }): void {
    void this.db.apiLog
      .create({
        data: {
          requestId: ctx.requestId,
          userId: ctx.userId ?? null,
          apiKeyId: ctx.apiKeyId ?? null,
          method,
          path: path.slice(0, 500),
          status,
          durationMs: Math.round(performance.now() - ctx.startedAt),
          ip: ctx.ip,
          action: ctx.action ?? null,
          metadata: (ctx.metadata ?? {}) as Prisma.InputJsonObject
        }
      })
      .catch((e: unknown) => this.log.error({ err: e }, 'failed to write api log'));
  }

  async list(q: { page?: number; limit?: number; action?: string; onlyActions?: boolean }): Promise<PaginatedResult<AuditLogDtoT>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.ApiLogWhereInput = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.onlyActions ? { action: { not: null } } : {})
    };
    const [rows, total] = await this.db.$transaction([
      this.db.apiLog.findMany({
        where,
        include: { user: { select: { email: true } }, apiKey: { select: { prefix: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.db.apiLog.count({ where })
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        requestId: r.requestId,
        userEmail: r.user?.email ?? null,
        apiKeyPrefix: r.apiKey?.prefix ?? null,
        method: r.method,
        path: r.path,
        status: r.status,
        durationMs: r.durationMs,
        action: r.action,
        createdAt: iso(r.createdAt)
      })),
      meta: { page, limit, total, totalPages: totalPages(total, limit) }
    };
  }
}

export function auditController(auth: AuthService, audit: AuditService) {
  return new Elysia({ prefix: '/api/v1/audit-logs' }).use(authPlugin(auth)).get('', ({ query }) => audit.list(query), {
    auth: { role: 'ADMIN' },
    query: t.Object({
      page: t.Optional(QueryInt({ minimum: 1 })),
      limit: t.Optional(QueryInt({ minimum: 1, maximum: 200 })),
      action: t.Optional(t.String({ maxLength: 100 })),
      onlyActions: t.Optional(t.Boolean())
    }),
    response: { 200: Paginated(AuditLogDto) },
    detail: { tags: ['Audit'], security: [{ bearerAuth: [] }] }
  });
}
