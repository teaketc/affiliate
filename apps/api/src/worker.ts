import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { loadEnv } from './config/env';
import { createContainer } from './container';
import { PermanentSyncError } from './modules/sync/sync.processor';
import { JOB_SYNC, JOB_TICK, SYNC_ATTEMPTS, SYNC_QUEUE, type SyncJobData } from './modules/sync/sync.queue';

/**
 * Background worker (separate process from the HTTP API).
 *  - `sync`: runs one SyncProcessor attempt; BullMQ retries with exponential backoff
 *  - `scheduled-tick`: repeatable job that fans out scheduled syncs
 */
const env = loadEnv();
const c = createContainer(env, 'worker');

function isSyncData(v: unknown): v is SyncJobData {
  return typeof v === 'object' && v !== null && typeof (v as { syncJobId?: unknown }).syncJobId === 'string';
}

const worker = new Worker(
  SYNC_QUEUE,
  async (job: Job) => {
    if (job.name === JOB_TICK) {
      const created = await c.sync.runScheduled();
      const pruned = await c.settings.applyRetention();
      c.log.info({ created, pruned }, 'scheduled tick done');
      return { created, pruned };
    }
    if (job.name !== JOB_SYNC || !isSyncData(job.data)) throw new UnrecoverableError(`unknown job ${job.name}`);
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? SYNC_ATTEMPTS;
    try {
      return await c.syncProcessor.run(job.data.syncJobId, attempt, attempt >= maxAttempts);
    } catch (e) {
      if (e instanceof PermanentSyncError) throw new UnrecoverableError(e.message);
      throw e;
    }
  },
  {
    connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
    concurrency: env.SYNC_CONCURRENCY,
    lockDuration: 5 * 60_000
  }
);

worker.on('ready', () => c.log.info({ concurrency: env.SYNC_CONCURRENCY }, 'sync worker ready'));
worker.on('failed', (job, err) => c.log.warn({ jobId: job?.id, attemptsMade: job?.attemptsMade, err }, 'job failed'));
worker.on('error', (err) => c.log.error({ err }, 'worker error'));

void c.settings
  .get()
  .then((s) => c.syncQueue.schedule(s.syncCron, s.syncEnabled))
  .catch((e: unknown) => c.log.error({ err: e }, 'failed to register sync scheduler'));

async function shutdown(signal: string) {
  c.log.info({ signal }, 'shutting down worker (waiting for active jobs)');
  await worker.close();
  await c.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
