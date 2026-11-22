# Production Deployment Guide

## 1. Topology

```
            ┌────────────── TLS (Caddy / Nginx / Cloud LB) ──────────────┐
 admin.example.com ──► web (SvelteKit, node)  ──► api:3000 (internal)    │
 api.example.com   ──► api (Elysia/Bun) ×N ──► PostgreSQL (managed)      │
 go.example.com/r/* ─► api (click redirect)  ──► Redis (managed, AOF)    │
                       worker (BullMQ/Bun) ×M ─┘                         │
            └─────────────────────────────────────────────────────────────┘
```

* `api` is stateless — scale horizontally. Rate limits, caches and the provider throttle live in Redis, so they hold across replicas.
* `worker` scales independently (`SYNC_CONCURRENCY` per process). BullMQ guarantees one worker per job; the scheduler is an idempotent `upsertJobScheduler`, so every replica can register it safely.
* `web` only talks to `api` over the private network (`API_URL`). The API port does not need to be public for the dashboard; expose it only for external API-key clients and `/r/:code`.

## 2. Infrastructure checklist

| Component | Recommendation |
|---|---|
| PostgreSQL | 16+, managed (RDS / Cloud SQL / Neon). Extensions: `pgcrypto`, `pg_trgm` (the migration creates them; the DB role needs permission or create them up front). PITR backups on. |
| Redis | 7+, **`maxmemory-policy noeviction`** (required by BullMQ), AOF on. Use a separate logical DB or instance from any cache that evicts. |
| Secrets | Secret manager (AWS Secrets Manager / GCP Secret Manager / Vault / Doppler) injected as env vars. Never bake into images. |
| TLS | Terminate at the load balancer; set `TRUST_PROXY=true` **only** if the proxy overwrites `X-Forwarded-For`. |

## 3. Required environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | add `?connection_limit=10&pool_timeout=20` and size it as replicas × limit < max_connections. Use PgBouncer (transaction mode) + `pgbouncer=true` for large fleets. |
| `REDIS_URL` | `rediss://` for TLS |
| `JWT_SECRET` | ≥ 32 random bytes; rotating it logs everyone out |
| `CREDENTIALS_ENCRYPTION_KEY` | 32 bytes base64. **Losing it makes stored marketplace credentials unrecoverable** — back it up. Rotation: decrypt-with-old / encrypt-with-new script during maintenance. |
| `CLICK_IP_SALT` | random; changing it only breaks unique-visitor continuity |
| `CORS_ORIGINS` | comma-separated exact origins |
| `PUBLIC_BASE_URL` | public base for `/r/:code` tracking links |
| `SWAGGER_ENABLED` | `false` in production unless docs are needed publicly |
| `ORIGIN` (web) | public dashboard URL — required by SvelteKit CSRF checks behind a proxy |

## 4. Release procedure

1. CI: `bun install --frozen-lockfile` → `bun run typecheck` → `bun run test` (+ integration tests against an ephemeral Postgres/Redis service container).
2. Build images (the Dockerfiles also run typecheck + unit tests):

   ```bash
   docker build -f apps/api/Dockerfile -t registry.example.com/affiliate-api:$GIT_SHA .
   ```

   ```bash
   docker build -f apps/web/Dockerfile -t registry.example.com/affiliate-web:$GIT_SHA .
   ```

3. Run migrations **once** as a one-off job before rolling out:

   ```bash
   docker run --rm -e DATABASE_URL registry.example.com/affiliate-api:$GIT_SHA bunx prisma migrate deploy
   ```

4. Roll out `api` (rolling, readiness = `GET /ready`), then `worker` (SIGTERM → waits for active jobs; give it ≥ 60 s grace), then `web`.
5. First deploy only: create the first admin:

   ```bash
   docker run --rm -e DATABASE_URL -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD registry.example.com/affiliate-api:$GIT_SHA bun apps/api/src/scripts/seed.ts
   ```

Migrations are forward-only and additive by convention; for destructive changes use expand → migrate data → contract across two releases.

## 5. Kubernetes notes

* `api`: `readinessProbe: GET /ready`, `livenessProbe: GET /health`, `terminationGracePeriodSeconds: 30`, HPA on CPU / p95 latency.
* `worker`: no HTTP probe; use an exec probe or rely on restart policy. `terminationGracePeriodSeconds: 120`.
* Run as non-root (images use `bun` / `node` users); `readOnlyRootFilesystem: true` works for both.
* NetworkPolicy: only `web` and the ingress may reach `api`; only `api`/`worker` may reach Postgres/Redis.

## 6. Observability

* **Logs**: pino JSON on stdout (`service`, `requestId`, `userId`, `durationMs`, `status`). Ship to Loki / CloudWatch / Datadog. Secrets are redacted by path.
* **Request correlation**: `X-Request-Id` is accepted, generated if missing, returned on every response, stored in `api_logs.request_id`, and forwarded by the dashboard.
* **Health**: `/health` (liveness) and `/ready` (Postgres + Redis with latency, returns 503 when degraded).
* **Queue**: `GET /api/v1/sync/queue` (waiting / active / delayed / failed / completed). Alert when `failed` grows or `waiting` stays high.
* **Suggested alerts**: 5xx rate > 1 % (5 min) · `/ready` failing · sync jobs `FAILED` in last 24 h > 0 (`GET /api/v1/analytics/overview` → `sync.last24h.failed`) · Redis memory > 80 % · Postgres connections > 80 %.
* **Audit**: `api_logs` rows with `action` (login, account changes, key creation, settings, link generation). Plain request logs are pruned after 30 days; audited actions are kept.

## 7. Data retention & maintenance

* The scheduler tick prunes `price_histories` and `click_events` per System Settings, and unaudited `api_logs` older than 30 days.
* `click_events` and `api_logs` use BRIN indexes on `created_at`; at high volume, convert them to monthly range partitions (`pg_partman`) and drop old partitions instead of `DELETE`.
* Run `VACUUM (ANALYZE)` after large prunes if autovacuum lags.

## 8. Security hardening checklist

- [ ] `SWAGGER_ENABLED=false` (or protect `/docs` at the proxy)
- [ ] Unique strong `SEED_ADMIN_PASSWORD`; remove it from env after seeding
- [ ] Marketplace credentials entered only through the dashboard (encrypted at rest)
- [ ] `CORS_ORIGINS` limited to the dashboard origin(s)
- [ ] Postgres/Redis not publicly reachable; TLS in transit
- [ ] Image scanning (Trivy/Grype) in CI, Dependabot/Renovate for dependencies
- [ ] Verify Shopee `productOfferV2` fields against the dashboard documentation before enabling scheduled Shopee syncs (see README → Marketplace Providers)
