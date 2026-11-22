import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import type { Container } from './container';
import { AppError, TooManyRequestsError } from './lib/errors';
import { accountController } from './modules/accounts/account.module';
import { affiliateController, redirectController } from './modules/affiliate/affiliate.controller';
import { analyticsController } from './modules/analytics/analytics.module';
import { apiKeyController } from './modules/api-keys/api-key.controller';
import { auditController } from './modules/audit/audit.module';
import { authController } from './modules/auth/auth.controller';
import { campaignController } from './modules/campaigns/campaign.module';
import { categoryController } from './modules/categories/category.module';
import { healthController, type ReadinessProbe } from './modules/health/health.controller';
import { priceController } from './modules/price/price.module';
import { productController } from './modules/products/product.controller';
import { settingsController } from './modules/settings/settings.module';
import { syncController } from './modules/sync/sync.controller';
import { audit, clientIp, initAudit } from './plugins/request-context';

export const VERSION = '1.0.0';

type AppDeps = Pick<
  Container,
  | 'env' | 'log' | 'limiter' | 'auth' | 'apiKeys' | 'accounts' | 'products' | 'categories' | 'affiliate'
  | 'campaigns' | 'price' | 'sync' | 'analytics' | 'settings' | 'audit' | 'syncQueue'
> & { probes: ReadinessProbe[] };

const UNLIMITED = new Set(['/health', '/ready']);

export function createApp(c: AppDeps) {
  const origins = c.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

  const app = new Elysia({ name: 'affiliate-api' })
    .use(
      cors({
        origin: origins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id'],
        exposeHeaders: ['X-Request-Id', 'Retry-After', 'X-RateLimit-Remaining'],
        maxAge: 600
      })
    )
    // ---- request context, security headers, global IP rate limit ----
    .onRequest(async ({ request, server, set }) => {
      const ctx = initAudit(request, clientIp(request, server, c.env.TRUST_PROXY));
      set.headers['x-request-id'] = ctx.requestId;
      set.headers['x-content-type-options'] = 'nosniff';
      set.headers['x-frame-options'] = 'DENY';
      set.headers['referrer-policy'] = 'no-referrer';
      if (c.env.NODE_ENV === 'production') set.headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains';

      const path = new URL(request.url).pathname;
      if (UNLIMITED.has(path) || request.method === 'OPTIONS') return;
      const rl = await c.limiter.hit(`ip:${ctx.ip ?? 'unknown'}`, c.env.RATE_LIMIT_PER_MIN, 60);
      set.headers['x-ratelimit-remaining'] = String(rl.remaining);
      if (!rl.allowed) throw new TooManyRequestsError(rl.resetSec);
    })
    // ---- standard error envelope ----
    .onError(({ code, error, request, set }) => {
      const requestId = audit(request).requestId;
      if (error instanceof AppError) {
        set.status = error.status;
        if (error instanceof TooManyRequestsError) set.headers['retry-after'] = String(error.retryAfterSec);
        if (error.status >= 500) c.log.error({ err: error, requestId }, error.message);
        return { error: { code: error.code, message: error.message, requestId, ...(error.details ? { details: error.details } : {}) } };
      }
      switch (code) {
        case 'VALIDATION':
          set.status = 422;
          return {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              requestId,
              details: error.all.map((e) => ({ path: 'path' in e ? e.path : '', message: e.summary ?? ('message' in e ? e.message : '') }))
            }
          };
        case 'NOT_FOUND':
          set.status = 404;
          return { error: { code: 'NOT_FOUND', message: 'Route not found', requestId } };
        case 'PARSE':
          set.status = 400;
          return { error: { code: 'BAD_REQUEST', message: 'Malformed request body', requestId } };
        default:
          set.status = 500;
          c.log.error({ err: error, requestId, code }, 'unhandled error');
          return { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId } };
      }
    })
    // ---- structured access log + audit trail ----
    .onAfterResponse(({ request, set }) => {
      const ctx = audit(request);
      const path = new URL(request.url).pathname;
      const status = typeof set.status === 'number' ? set.status : 200;
      const durationMs = Math.round(performance.now() - ctx.startedAt);
      if (!UNLIMITED.has(path)) {
        c.log.info({ requestId: ctx.requestId, method: request.method, path, status, durationMs, userId: ctx.userId, apiKeyId: ctx.apiKeyId }, 'request');
      }
      if (path.startsWith('/api/')) c.audit.write({ ctx, method: request.method, path, status });
    });

  if (c.env.SWAGGER_ENABLED) {
    app.use(
      openapi({
        path: '/docs',
        documentation: {
          info: {
            title: 'Shopee & Lazada Affiliate Data Service',
            version: VERSION,
            description: 'Admin endpoints require a JWT (POST /api/v1/auth/login). External clients use `X-API-Key` with scopes.'
          },
          components: {
            securitySchemes: {
              bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
              apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
            }
          }
        }
      })
    );
  }

  return app
    .use(healthController(c.probes, VERSION))
    .use(redirectController(c.affiliate))
    .use(authController(c.auth))
    .use(apiKeyController(c.auth, c.apiKeys))
    .use(accountController(c.auth, c.accounts))
    .use(productController(c.auth, c.products))
    .use(categoryController(c.auth, c.categories))
    .use(affiliateController(c.auth, c.affiliate))
    .use(campaignController(c.auth, c.campaigns))
    .use(priceController(c.auth, c.price))
    .use(syncController(c.auth, c.sync))
    .use(analyticsController(c.auth, c.analytics))
    .use(settingsController(c.auth, c.settings, c.syncQueue))
    .use(auditController(c.auth, c.audit));
}

export type App = ReturnType<typeof createApp>;
