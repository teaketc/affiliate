import { Queue, type ConnectionOptions } from 'bullmq';

export const SYNC_QUEUE = 'product-sync';
export const JOB_SYNC = 'sync';
export const JOB_TICK = 'scheduled-tick';
export const SCHEDULER_ID = 'scheduled-sync';

export interface SyncJobData {
  syncJobId: string;
}

export const SYNC_ATTEMPTS = 5;

export interface SyncQueuePort {
  enqueue(syncJobId: string): Promise<string>;
  schedule(cron: string, enabled: boolean): Promise<void>;
  counts(): Promise<Record<string, number>>;
}

/** BullMQ queue wrapper. Job id == sync_jobs.id so enqueues are idempotent. */
export class SyncQueue implements SyncQueuePort {
  readonly queue: Queue;

  constructor(connection: ConnectionOptions) {
    this.queue = new Queue(SYNC_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: SYNC_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 7 * 86_400, count: 5_000 },
        removeOnFail: { age: 30 * 86_400 }
      }
    });
  }

  async enqueue(syncJobId: string): Promise<string> {
    const job = await this.queue.add(JOB_SYNC, { syncJobId } satisfies SyncJobData, { jobId: `sync-${syncJobId}` });
    return job.id ?? `sync-${syncJobId}`;
  }

  /** Upsert the repeatable "tick" that fans out scheduled syncs (BullMQ job schedulers). */
  async schedule(cron: string, enabled: boolean): Promise<void> {
    if (!enabled) {
      await this.queue.removeJobScheduler(SCHEDULER_ID);
      return;
    }
    await this.queue.upsertJobScheduler(SCHEDULER_ID, { pattern: cron, tz: 'Asia/Bangkok' }, { name: JOB_TICK, data: {}, opts: { attempts: 1 } });
  }

  async counts(): Promise<Record<string, number>> {
    return this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}
