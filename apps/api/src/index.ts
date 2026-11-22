import { createApp } from './app';
import { loadEnv } from './config/env';
import { createContainer } from './container';

const env = loadEnv();
const c = createContainer(env, 'api');

const app = createApp({
  ...c,
  probes: [
    { name: 'postgres', check: async () => void (await c.prisma.$queryRaw`SELECT 1`) },
    { name: 'redis', check: async () => void (await c.redis.ping()) }
  ]
}).listen({ port: env.PORT, hostname: '0.0.0.0' });

c.log.info({ port: env.PORT, docs: env.SWAGGER_ENABLED ? '/docs' : 'disabled' }, 'API listening');

// keep the scheduler in sync with stored settings on boot (idempotent upsert)
void c.settings
  .get()
  .then((s) => c.syncQueue.schedule(s.syncCron, s.syncEnabled))
  .catch((e: unknown) => c.log.error({ err: e }, 'failed to register sync scheduler'));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  c.log.info({ signal }, 'shutting down API');
  await app.stop();
  await c.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
