import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { SyncProductsBody } from '@affiliate/shared';
import { ProviderError, errorMessage } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { AffiliateProviderAdapter, NormalizedProduct } from '../../providers/types';
import type { UpsertResult } from '../products/product.repository';
import type { SyncJobRepositoryPort } from './sync.repository';

export interface SyncProcessorDeps {
  jobs: SyncJobRepositoryPort;
  log: Logger;
  getAccountContext(accountId: string): Promise<{ providerId: string; status: string; adapter: AffiliateProviderAdapter } | null>;
  upsert(providerId: string, product: NormalizedProduct): Promise<UpsertResult>;
  staleProducts(providerId: string, limit: number, olderThan: Date): Promise<{ externalId: string }[]>;
  onSuccess(accountId: string): Promise<void>;
}

export interface SyncStats {
  pages: number;
  fetched: number;
  created: number;
  updated: number;
  priceChanges: number;
  failedItems: number;
  durationMs: number;
}

/** Thrown for errors that must not be retried; the worker converts it to BullMQ UnrecoverableError. */
export class PermanentSyncError extends Error {}

/** Stored job params minus the account id (which lives on the job row). */
const JobParams = Type.Omit(SyncProductsBody, ['accountId']);

const PAGE_SIZE = 50;
const PRICE_BATCH = 200;
const PRICE_STALE_MS = 60 * 60 * 1000;

export class SyncProcessor {
  constructor(private readonly d: SyncProcessorDeps) {}

  /**
   * Execute one attempt. Resolves on success; throws on failure.
   * `isFinalAttempt` decides whether a retryable failure marks the job FAILED or leaves it QUEUED.
   */
  async run(syncJobId: string, attempt: number, isFinalAttempt: boolean): Promise<SyncStats> {
    const job = await this.d.jobs.findById(syncJobId);
    if (!job) throw new PermanentSyncError(`sync job ${syncJobId} not found`);
    if (job.status === 'CANCELLED' || job.status === 'SUCCESS') {
      throw new PermanentSyncError(`sync job is ${job.status}`);
    }

    const started = Date.now();
    await this.d.jobs.update(syncJobId, { status: 'RUNNING', attempts: attempt, startedAt: new Date(), error: null });
    const log = this.d.log.child({ syncJobId, accountId: job.accountId, type: job.type, attempt });
    const stats: SyncStats = { pages: 0, fetched: 0, created: 0, updated: 0, priceChanges: 0, failedItems: 0, durationMs: 0 };

    try {
      // configuration problems (undecryptable/invalid credentials, bad region) will not fix themselves on retry
      const ctx = await this.d.getAccountContext(job.accountId).catch((e: unknown) => {
        throw new PermanentSyncError(`account configuration error: ${errorMessage(e)}`);
      });
      if (!ctx) throw new PermanentSyncError('affiliate account no longer exists');
      if (ctx.status !== 'ACTIVE') throw new PermanentSyncError(`affiliate account is ${ctx.status}`);

      const params = Value.Check(JobParams, job.params) ? job.params : {};

      const ingest = async (items: NormalizedProduct[]) => {
        stats.fetched += items.length;
        for (const item of items) {
          try {
            const r = await this.d.upsert(ctx.providerId, item);
            if (r.created) stats.created++;
            else stats.updated++;
            if (r.priceChanged) stats.priceChanges++;
          } catch (e) {
            stats.failedItems++;
            log.warn({ err: e, externalId: item.externalId }, 'failed to upsert product');
          }
        }
      };

      if (job.type === 'PRODUCTS') {
        const maxPages = params.maxPages ?? 5;
        for (let page = 1; page <= maxPages; page++) {
          const res = await ctx.adapter.searchProducts({
            keyword: params.keyword,
            categoryExternalId: params.categoryExternalId,
            page,
            limit: PAGE_SIZE
          });
          stats.pages++;
          await ingest(res.items);
          await this.d.jobs.update(syncJobId, { stats: { ...stats, durationMs: Date.now() - started } });
          if (!res.hasNextPage) break;
        }
      } else {
        const stale = await this.d.staleProducts(ctx.providerId, PRICE_BATCH, new Date(Date.now() - PRICE_STALE_MS));
        if (stale.length > 0) {
          const items = await ctx.adapter.getProductsByIds(stale.map((s) => s.externalId));
          stats.pages = 1;
          await ingest(items);
        }
      }

      stats.durationMs = Date.now() - started;
      await this.d.jobs.update(syncJobId, { status: 'SUCCESS', stats: { ...stats }, finishedAt: new Date(), error: null });
      await this.d.onSuccess(job.accountId);
      log.info({ stats }, 'sync finished');
      return stats;
    } catch (e) {
      const permanent = e instanceof PermanentSyncError || (e instanceof ProviderError && !e.retryable);
      const final = permanent || isFinalAttempt;
      stats.durationMs = Date.now() - started;
      await this.d.jobs.update(syncJobId, {
        status: final ? 'FAILED' : 'QUEUED',
        error: errorMessage(e).slice(0, 2000),
        stats: { ...stats },
        finishedAt: final ? new Date() : null
      });
      log.error({ err: e, permanent, final }, 'sync attempt failed');
      if (permanent && !(e instanceof PermanentSyncError)) throw new PermanentSyncError(errorMessage(e));
      throw e;
    }
  }
}
