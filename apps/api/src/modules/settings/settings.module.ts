import { Elysia } from 'elysia';
import type { Prisma, PrismaClient } from '@prisma/client';
import { Value } from '@sinclair/typebox/value';
import { ErrorResponse, SystemSettingsDto, type SystemSettingsDto as Settings } from '@affiliate/shared';
import type { Cache } from '../../lib/cache';
import { BadRequestError } from '../../lib/errors';
import { authPlugin } from '../../plugins/auth';
import { auditAction } from '../../plugins/request-context';
import type { AuthService } from '../auth/auth.service';
import type { SyncQueuePort } from '../sync/sync.queue';

export const DEFAULT_SETTINGS: Settings = {
  syncCron: '0 */6 * * *',
  syncEnabled: true,
  priceHistoryRetentionDays: 365,
  clickRetentionDays: 180,
  defaultSyncKeywords: []
};

const KEY = 'system';

/** 5-field cron with *, numbers, ranges, steps and lists. */
export function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const field = /^(\*|\d+(-\d+)?)(\/\d+)?(,(\*|\d+(-\d+)?)(\/\d+)?)*$/;
  return parts.every((p) => field.test(p));
}

export class SettingsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly cache: Cache
  ) {}

  async get(): Promise<Settings> {
    return this.cache.wrap('settings:system', 60, async () => {
      const row = await this.db.systemSetting.findUnique({ where: { key: KEY } });
      const merged: unknown = { ...DEFAULT_SETTINGS, ...(row && typeof row.value === 'object' ? row.value : {}) };
      return Value.Check(SystemSettingsDto, merged) ? merged : DEFAULT_SETTINGS;
    });
  }

  /** Enforce retention settings; runs on every scheduler tick. Returns deleted row counts. */
  async applyRetention(now = new Date()): Promise<{ priceHistories: number; clickEvents: number; apiLogs: number }> {
    const s = await this.get();
    const before = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const [priceHistories, clickEvents, apiLogs] = await Promise.all([
      this.db.priceHistory.deleteMany({ where: { recordedAt: { lt: before(s.priceHistoryRetentionDays) } } }),
      this.db.clickEvent.deleteMany({ where: { createdAt: { lt: before(s.clickRetentionDays) } } }),
      // request logs without an audit action are operational noise after 30 days
      this.db.apiLog.deleteMany({ where: { action: null, createdAt: { lt: before(30) } } })
    ]);
    return { priceHistories: priceHistories.count, clickEvents: clickEvents.count, apiLogs: apiLogs.count };
  }

  async update(value: Settings, queue: SyncQueuePort): Promise<Settings> {
    if (!isValidCron(value.syncCron)) throw new BadRequestError('syncCron must be a 5-field cron expression');
    await this.db.systemSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: value as unknown as Prisma.InputJsonObject },
      update: { value: value as unknown as Prisma.InputJsonObject }
    });
    await this.cache.del('settings:system');
    await queue.schedule(value.syncCron, value.syncEnabled);
    return value;
  }
}

export function settingsController(auth: AuthService, settings: SettingsService, queue: SyncQueuePort) {
  return new Elysia({ prefix: '/api/v1/settings' })
    .use(authPlugin(auth))
    .get('', () => settings.get(), {
      auth: { role: 'VIEWER' },
      response: { 200: SystemSettingsDto },
      detail: { tags: ['Settings'], security: [{ bearerAuth: [] }] }
    })
    .put(
      '',
      async ({ body, request }) => {
        const s = await settings.update(body, queue);
        auditAction(request, 'settings.update', { ...s });
        return s;
      },
      {
        auth: { role: 'ADMIN' },
        body: SystemSettingsDto,
        response: { 200: SystemSettingsDto, 400: ErrorResponse },
        detail: { tags: ['Settings'], security: [{ bearerAuth: [] }] }
      }
    );
}
