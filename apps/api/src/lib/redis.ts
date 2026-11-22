import IORedis, { type Redis } from 'ioredis';

export type { Redis };

/**
 * ioredis is BullMQ's default client and runs on Bun. `maxRetriesPerRequest: null` is required by
 * BullMQ for blocking worker connections.
 */
export function createRedis(url: string, opts: { forBullMq?: boolean } = {}): Redis {
  return new IORedis(url, {
    maxRetriesPerRequest: opts.forBullMq ? null : 3,
    enableReadyCheck: true,
    lazyConnect: false
  });
}
