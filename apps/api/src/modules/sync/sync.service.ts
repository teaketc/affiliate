import type { Prisma } from '@prisma/client';
import {
  totalPages,
  type PaginatedResult,
  type SyncJobDto,
  type SyncJobQuery,
  type SyncProductsBody,
  type SyncTrigger
} from '@affiliate/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { iso } from '../../lib/prisma';
import { isRecord } from '../../lib/http';
import type { Logger } from '../../lib/logger';
import type { AccountRepository } from '../accounts/account.module';
import type { SettingsService } from '../settings/settings.module';
import type { SyncQueuePort } from './sync.queue';
import type { SyncJobRepository, SyncJobRow } from './sync.repository';

export function toSyncJobDto(j: SyncJobRow): SyncJobDto {
  return {
    id: j.id,
    accountId: j.accountId,
    accountName: j.account.name,
    marketplace: j.account.provider.code,
    type: j.type,
    trigger: j.trigger,
    status: j.status,
    params: isRecord(j.params) ? j.params : {},
    stats: isRecord(j.stats) ? j.stats : {},
    attempts: j.attempts,
    error: j.error,
    startedAt: iso(j.startedAt),
    finishedAt: iso(j.finishedAt),
    createdAt: iso(j.createdAt)
  };
}

export class SyncService {
  constructor(
    private readonly jobs: SyncJobRepository,
    private readonly accounts: AccountRepository,
    private readonly queue: SyncQueuePort,
    private readonly settings: SettingsService,
    private readonly log: Logger
  ) {}

  async request(body: SyncProductsBody, trigger: SyncTrigger): Promise<SyncJobDto> {
    const account = await this.accounts.findById(body.accountId);
    if (!account) throw new NotFoundError('Affiliate account');
    if (account.status !== 'ACTIVE' || !account.provider.isEnabled) {
      throw new BadRequestError('Account or marketplace is disabled');
    }
    const type = body.type ?? 'PRODUCTS';
    if (trigger === 'MANUAL' && (await this.jobs.hasInFlight(account.id, type))) {
      throw new ConflictError('A sync of this type is already queued or running for this account');
    }
    const { accountId: _ignored, ...params } = body;
    const job = await this.jobs.create({ accountId: account.id, type, trigger, params: { accountId: account.id, ...params } });
    const queueJobId = await this.queue.enqueue(job.id);
    await this.jobs.update(job.id, { queueJobId });
    return toSyncJobDto({ ...job, queueJobId });
  }

  /** Re-queue a FAILED job as a fresh sync with the same parameters. */
  async retry(id: string): Promise<SyncJobDto> {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundError('Sync job');
    if (job.status !== 'FAILED' && job.status !== 'CANCELLED') throw new BadRequestError('Only failed or cancelled jobs can be retried');
    const params = isRecord(job.params) ? job.params : {};
    return this.request(
      {
        accountId: job.accountId,
        type: job.type,
        keyword: typeof params.keyword === 'string' ? params.keyword : undefined,
        categoryExternalId: typeof params.categoryExternalId === 'string' ? params.categoryExternalId : undefined,
        maxPages: typeof params.maxPages === 'number' ? params.maxPages : undefined
      },
      'MANUAL'
    );
  }

  async cancel(id: string): Promise<SyncJobDto> {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundError('Sync job');
    if (job.status !== 'QUEUED') throw new BadRequestError('Only queued jobs can be cancelled');
    await this.jobs.update(id, { status: 'CANCELLED', finishedAt: new Date() });
    return toSyncJobDto({ ...job, status: 'CANCELLED', finishedAt: new Date() });
  }

  async get(id: string): Promise<SyncJobDto> {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundError('Sync job');
    return toSyncJobDto(job);
  }

  async list(q: SyncJobQuery): Promise<PaginatedResult<SyncJobDto>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.SyncJobWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.accountId ? { accountId: q.accountId } : {})
    };
    const { rows, total } = await this.jobs.list(where, (page - 1) * limit, limit);
    return { data: rows.map(toSyncJobDto), meta: { page, limit, total, totalPages: totalPages(total, limit) } };
  }

  /** Fan-out for the repeatable scheduler tick: products per keyword + one price refresh per account. */
  async runScheduled(): Promise<number> {
    const s = await this.settings.get();
    if (!s.syncEnabled) return 0;
    await this.jobs.markStale(new Date(Date.now() - 2 * 60 * 60 * 1000));
    const accounts = await this.accounts.listActive();
    let created = 0;
    for (const a of accounts) {
      const keywords = s.defaultSyncKeywords.length > 0 ? s.defaultSyncKeywords : [undefined];
      for (const keyword of keywords) {
        await this.request({ accountId: a.id, type: 'PRODUCTS', keyword, maxPages: 3 }, 'SCHEDULED');
        created++;
      }
      await this.request({ accountId: a.id, type: 'PRICES' }, 'SCHEDULED');
      created++;
    }
    this.log.info({ created, accounts: accounts.length }, 'scheduled sync fan-out');
    return created;
  }

  queueCounts(): Promise<Record<string, number>> {
    return this.queue.counts();
  }
}
