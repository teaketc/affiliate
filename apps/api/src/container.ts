import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Env } from './config/env';
import { RedisCache, type Cache } from './lib/cache';
import { SecretBox } from './lib/crypto';
import type { FetchFn } from './lib/http';
import { createLogger, type Logger } from './lib/logger';
import { createPrisma } from './lib/prisma';
import { ProviderThrottle, RedisRateLimiter, type RateLimiter } from './lib/rate-limiter';
import { createRedis } from './lib/redis';
import { ProviderFactory } from './providers/registry';
import { AccountRepository, AccountService } from './modules/accounts/account.module';
import { AffiliateService } from './modules/affiliate/affiliate.service';
import { LinkRepository } from './modules/affiliate/link.repository';
import { AnalyticsService } from './modules/analytics/analytics.module';
import { ApiKeyRepository } from './modules/api-keys/api-key.repository';
import { ApiKeyService } from './modules/api-keys/api-key.service';
import { AuditService } from './modules/audit/audit.module';
import { AuthService } from './modules/auth/auth.service';
import { UserRepository } from './modules/auth/user.repository';
import { CampaignRepository, CampaignService } from './modules/campaigns/campaign.module';
import { CategoryRepository, CategoryService } from './modules/categories/category.module';
import { PriceRepository, PriceService } from './modules/price/price.module';
import { ProductRepository } from './modules/products/product.repository';
import { ProductService } from './modules/products/product.service';
import { SettingsService } from './modules/settings/settings.module';
import { SyncProcessor } from './modules/sync/sync.processor';
import { SyncQueue } from './modules/sync/sync.queue';
import { SyncJobRepository } from './modules/sync/sync.repository';
import { SyncService } from './modules/sync/sync.service';

/** Composition root — the only place that wires concrete implementations together. */
export interface Container {
  env: Env;
  log: Logger;
  prisma: PrismaClient;
  redis: Redis;
  cache: Cache;
  limiter: RateLimiter;
  syncQueue: SyncQueue;
  auth: AuthService;
  apiKeys: ApiKeyService;
  accounts: AccountService;
  products: ProductService;
  categories: CategoryService;
  affiliate: AffiliateService;
  campaigns: CampaignService;
  price: PriceService;
  sync: SyncService;
  syncProcessor: SyncProcessor;
  analytics: AnalyticsService;
  settings: SettingsService;
  audit: AuditService;
  close(): Promise<void>;
}

export interface ContainerOverrides {
  /** Stub marketplace HTTP (integration tests) */
  providerFetch?: FetchFn;
}

export function createContainer(env: Env, name = 'api', overrides: ContainerOverrides = {}): Container {
  const log = createLogger(env.LOG_LEVEL, name);
  const prisma = createPrisma(log, env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  const cache = new RedisCache(redis, log);
  const limiter = new RedisRateLimiter(redis);
  const box = new SecretBox(env.CREDENTIALS_ENCRYPTION_KEY);
  const factory = new ProviderFactory(box, new ProviderThrottle(limiter), env.PROVIDER_TIMEOUT_MS, overrides.providerFetch);
  const syncQueue = new SyncQueue({ url: env.REDIS_URL, maxRetriesPerRequest: null });

  const userRepo = new UserRepository(prisma);
  const apiKeyRepo = new ApiKeyRepository(prisma);
  const accountRepo = new AccountRepository(prisma);
  const productRepo = new ProductRepository(prisma);
  const linkRepo = new LinkRepository(prisma);
  const syncRepo = new SyncJobRepository(prisma);

  const auth = new AuthService(userRepo, apiKeyRepo, limiter, {
    jwtSecret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    ttlSeconds: env.JWT_TTL_SECONDS
  });
  const accounts = new AccountService(accountRepo, box, factory);
  const products = new ProductService(productRepo, cache);
  const settings = new SettingsService(prisma, cache);

  const affiliate = new AffiliateService({
    links: linkRepo,
    cache,
    log,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    clickSalt: env.CLICK_IP_SALT,
    getAccount: async (id) => {
      const a = await accountRepo.findById(id);
      return a && { id: a.id, status: a.status, marketplace: a.provider.code, providerId: a.providerId };
    },
    getAdapter: async (id) => accounts.adapterFor(await accounts.get(id)),
    getProduct: (id) =>
      prisma.product.findUnique({ where: { id }, select: { id: true, providerId: true, externalId: true, productUrl: true } }),
    getCampaign: (id) => prisma.campaign.findUnique({ where: { id }, select: { id: true, accountId: true, code: true, status: true } })
  });

  const syncProcessor = new SyncProcessor({
    jobs: syncRepo,
    log,
    getAccountContext: async (accountId) => {
      const a = await accountRepo.findById(accountId);
      if (!a) return null;
      return { providerId: a.providerId, status: a.status, adapter: await accounts.adapterFor(a) };
    },
    upsert: (providerId, p) => productRepo.upsertNormalized(providerId, p),
    staleProducts: (providerId, limit, olderThan) => productRepo.findExternalIds(providerId, limit, olderThan),
    onSuccess: async (accountId) => {
      await accountRepo.markSynced(accountId);
      await products.invalidate();
      await cache.del('categories:*:*');
    }
  });

  return {
    env,
    log,
    prisma,
    redis,
    cache,
    limiter,
    syncQueue,
    auth,
    apiKeys: new ApiKeyService(apiKeyRepo),
    accounts,
    products,
    categories: new CategoryService(new CategoryRepository(prisma), cache),
    affiliate,
    campaigns: new CampaignService(new CampaignRepository(prisma)),
    price: new PriceService(new PriceRepository(prisma)),
    sync: new SyncService(syncRepo, accountRepo, syncQueue, settings, log),
    syncProcessor,
    analytics: new AnalyticsService(prisma, cache),
    settings,
    audit: new AuditService(prisma, log),
    async close() {
      await syncQueue.close();
      await prisma.$disconnect();
      redis.disconnect();
    }
  };
}
