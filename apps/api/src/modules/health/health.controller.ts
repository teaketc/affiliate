import { Elysia, t } from 'elysia';

export interface ReadinessProbe {
  name: string;
  check(): Promise<void>;
}

const started = Date.now();

export function healthController(probes: ReadinessProbe[], version: string) {
  return new Elysia()
    .get('/health', () => ({ status: 'ok' as const, uptimeSec: Math.round((Date.now() - started) / 1000), version }), {
      response: { 200: t.Object({ status: t.Literal('ok'), uptimeSec: t.Number(), version: t.String() }) },
      detail: { tags: ['Health'], summary: 'Liveness probe' }
    })
    .get(
      '/ready',
      async ({ set }) => {
        const results = await Promise.all(
          probes.map(async (p) => {
            const t0 = performance.now();
            try {
              await Promise.race([p.check(), Bun.sleep(2000).then(() => Promise.reject(new Error('timeout')))]);
              return { name: p.name, ok: true, latencyMs: Math.round(performance.now() - t0) };
            } catch (e) {
              return { name: p.name, ok: false, latencyMs: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : 'failed' };
            }
          })
        );
        const ok = results.every((r) => r.ok);
        set.status = ok ? 200 : 503;
        return { status: ok ? ('ready' as const) : ('not_ready' as const), checks: results };
      },
      { detail: { tags: ['Health'], summary: 'Readiness probe (PostgreSQL + Redis)' } }
    );
}
