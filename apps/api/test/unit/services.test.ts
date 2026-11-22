import { describe, expect, test } from 'bun:test';
import type { Marketplace } from '@affiliate/shared';
import { MemoryCache } from '../../src/lib/cache';
import { BadRequestError, ProviderError } from '../../src/lib/errors';
import { createLogger } from '../../src/lib/logger';
import { AffiliateService, type AffiliateDeps } from '../../src/modules/affiliate/affiliate.service';
import type { LinkRepositoryPort, LinkRow, NewLink } from '../../src/modules/affiliate/link.repository';
import { PermanentSyncError, SyncProcessor } from '../../src/modules/sync/sync.processor';
import type { SyncJobPatch, SyncJobRow } from '../../src/modules/sync/sync.repository';
import type { AffiliateProviderAdapter, GenerateLinkInput, NormalizedProduct } from '../../src/providers/types';

const log = createLogger('silent');
const user = { kind: 'user' as const, userId: '00000000-0000-0000-0000-000000000001', email: 'a@b.c', role: 'EDITOR' as const };

function adapter(marketplace: Marketplace, overrides: Partial<AffiliateProviderAdapter> = {}): AffiliateProviderAdapter & { linkCalls: GenerateLinkInput[] } {
  const linkCalls: GenerateLinkInput[] = [];
  return {
    marketplace,
    maxSubIds: marketplace === 'SHOPEE' ? 5 : 6,
    linkCalls,
    searchProducts: async () => ({ items: [], hasNextPage: false }),
    getProductsByIds: async () => [],
    generateLink: async (input) => {
      linkCalls.push(input);
      return { shortLink: 'https://s.shopee.co.th/abc', raw: {} };
    },
    testConnection: async () => undefined,
    ...overrides
  };
}

class FakeLinks implements LinkRepositoryPort {
  created: NewLink[] = [];
  clicks: string[] = [];
  async create(data: NewLink): Promise<LinkRow> {
    this.created.push(data);
    return {
      id: 'l1', ...data, clickCount: 0, createdAt: new Date('2026-01-01T00:00:00Z'),
      account: { provider: { code: 'SHOPEE' } }, product: null, campaign: null
    };
  }
  async list() {
    return { rows: [], total: 0 };
  }
  async findByCode(code: string) {
    return code === 'Abcdefgh' ? { id: 'l1', shortLink: 'https://s.shopee.co.th/abc', subIds: [] } : null;
  }
  async recordClick(linkId: string) {
    this.clicks.push(linkId);
  }
}

function deps(overrides: Partial<AffiliateDeps> = {}, ad = adapter('SHOPEE')): AffiliateDeps & { links: FakeLinks } {
  return {
    links: new FakeLinks(),
    cache: new MemoryCache(),
    log,
    publicBaseUrl: 'https://aff.example.com',
    clickSalt: 'salt-salt-salt-salt',
    getAccount: async (id) => (id === 'acc' ? { id: 'acc', status: 'ACTIVE', marketplace: 'SHOPEE', providerId: 'prov-shopee' } : null),
    getAdapter: async () => ad,
    getProduct: async (id) => (id === 'p1' ? { id: 'p1', providerId: 'prov-shopee', externalId: '99', productUrl: 'https://shopee.co.th/product/1/99' } : id === 'pl' ? { id: 'pl', providerId: 'prov-lazada', externalId: '1', productUrl: 'https://www.lazada.co.th/products/i1.html' } : null),
    getCampaign: async (id) => (id === 'c1' ? { id: 'c1', accountId: 'acc', code: 'SUMMER', status: 'ACTIVE' } : id === 'cEnded' ? { id: 'cEnded', accountId: 'acc', code: 'OLD', status: 'ENDED' } : null),
    ...overrides
  } as AffiliateDeps & { links: FakeLinks };
}

describe('AffiliateService.generate', () => {
  test('uses product URL, puts campaign code first in subIds, returns tracking url', async () => {
    const ad = adapter('SHOPEE');
    const d = deps({}, ad);
    const svc = new AffiliateService(d);
    const dto = await svc.generate(user, { accountId: 'acc', productId: 'p1', campaignId: 'c1', subIds: ['fb', 'post1'] });
    expect(ad.linkCalls[0]?.originUrl).toBe('https://shopee.co.th/product/1/99');
    expect(ad.linkCalls[0]?.subIds).toEqual(['SUMMER', 'fb', 'post1']);
    expect(dto.trackingUrl).toMatch(/^https:\/\/aff\.example\.com\/r\/[A-Za-z0-9]{8}$/);
    expect(d.links.created[0]?.createdById).toBe(user.userId);
  });

  test('truncates subIds to provider maximum', async () => {
    const ad = adapter('SHOPEE');
    await new AffiliateService(deps({}, ad)).generate(user, { accountId: 'acc', originUrl: 'https://shopee.co.th/x', campaignId: 'c1', subIds: ['a', 'b', 'c', 'd', 'e'] });
    expect(ad.linkCalls[0]?.subIds).toHaveLength(5);
  });

  test('rejects product from a different marketplace', async () => {
    const err = await new AffiliateService(deps()).generate(user, { accountId: 'acc', productId: 'pl' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestError);
  });

  test('rejects foreign origin urls and ended campaigns', async () => {
    const svc = new AffiliateService(deps());
    expect(svc.generate(user, { accountId: 'acc', originUrl: 'https://evil.com/x' })).rejects.toBeInstanceOf(BadRequestError);
    expect(svc.generate(user, { accountId: 'acc', originUrl: 'https://shopee.co.th/x', campaignId: 'cEnded' })).rejects.toBeInstanceOf(BadRequestError);
  });

  test('requires productId or originUrl', async () => {
    expect(new AffiliateService(deps()).generate(user, { accountId: 'acc' })).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('AffiliateService.resolveClick', () => {
  test('returns target, records click with hashed ip, ignores bad codes', async () => {
    const d = deps();
    const svc = new AffiliateService(d);
    const target = await svc.resolveClick('Abcdefgh', { ip: '1.2.3.4', userAgent: 'UA', referer: null, country: 'TH', query: { utm_source: 'line' } });
    expect(target).toBe('https://s.shopee.co.th/abc');
    await Bun.sleep(1);
    expect(d.links.clicks).toEqual(['l1']);
    expect(await svc.resolveClick('../etc', { ip: null, userAgent: null, referer: null, country: null, query: {} })).toBeNull();
  });
});

// ---------------------------------------------------------------- sync
function product(id: string): NormalizedProduct {
  return {
    externalId: id, name: `P${id}`, productUrl: 'https://shopee.co.th/x', offerLink: null, imageUrl: null, images: [],
    shopId: null, shopName: null, brandName: null, currency: 'THB', price: '10.00', originalPrice: null,
    discountRate: '0.0000', commissionRate: '0.0500', commissionAmount: null, rating: null, salesCount: 0, stock: null,
    categories: [], variants: [], promotions: [], raw: {}
  };
}

function syncHarness(opts: { adapter: AffiliateProviderAdapter; params?: Record<string, string | number>; type?: 'PRODUCTS' | 'PRICES' }) {
  const patches: SyncJobPatch[] = [];
  const job: SyncJobRow = {
    id: 'j1', accountId: 'acc', type: opts.type ?? 'PRODUCTS', trigger: 'MANUAL', status: 'QUEUED', queueJobId: null,
    params: opts.params ?? { accountId: 'acc', maxPages: 3 }, stats: {}, attempts: 0, error: null, startedAt: null,
    finishedAt: null, createdAt: new Date(), account: { name: 'A', provider: { code: 'SHOPEE' } }
  };
  const upserted: string[] = [];
  let succeeded = 0;
  const proc = new SyncProcessor({
    jobs: { findById: async () => job, update: async (_id, p) => void patches.push(p) },
    log,
    getAccountContext: async () => ({ providerId: 'prov', status: 'ACTIVE', adapter: opts.adapter }),
    upsert: async (_pid, p) => {
      upserted.push(p.externalId);
      return { productId: p.externalId, created: true, priceChanged: true };
    },
    staleProducts: async () => [{ externalId: '1' }, { externalId: '2' }],
    onSuccess: async () => void succeeded++
  });
  return { proc, patches, upserted, succeeded: () => succeeded };
}

describe('SyncProcessor', () => {
  test('paginates until hasNextPage=false and records stats', async () => {
    let calls = 0;
    const ad = adapter('SHOPEE', {
      searchProducts: async ({ page }) => {
        calls++;
        return { items: [product(`${page}a`), product(`${page}b`)], hasNextPage: page < 2 };
      }
    });
    const h = syncHarness({ adapter: ad });
    const stats = await h.proc.run('j1', 1, false);
    expect(calls).toBe(2);
    expect(stats).toMatchObject({ pages: 2, fetched: 4, created: 4, priceChanges: 4 });
    expect(h.patches[0]?.status).toBe('RUNNING');
    expect(h.patches.at(-1)?.status).toBe('SUCCESS');
    expect(h.succeeded()).toBe(1);
  });

  test('respects maxPages', async () => {
    const ad = adapter('SHOPEE', { searchProducts: async () => ({ items: [product('x')], hasNextPage: true }) });
    const h = syncHarness({ adapter: ad, params: { accountId: 'acc', maxPages: 1 } });
    expect((await h.proc.run('j1', 1, false)).pages).toBe(1);
  });

  test('PRICES refreshes stale products by id', async () => {
    const ad = adapter('SHOPEE', { getProductsByIds: async (ids) => ids.map(product) });
    const h = syncHarness({ adapter: ad, type: 'PRICES' });
    await h.proc.run('j1', 1, false);
    expect(h.upserted).toEqual(['1', '2']);
  });

  test('retryable failure leaves job QUEUED until final attempt', async () => {
    const ad = adapter('SHOPEE', {
      searchProducts: async () => {
        throw new ProviderError('SHOPEE', 'rate limit', true, '10030');
      }
    });
    const h = syncHarness({ adapter: ad });
    expect(h.proc.run('j1', 1, false)).rejects.toBeInstanceOf(ProviderError);
    await Bun.sleep(1);
    expect(h.patches.at(-1)?.status).toBe('QUEUED');
    expect(h.proc.run('j1', 5, true)).rejects.toBeInstanceOf(ProviderError);
    await Bun.sleep(1);
    expect(h.patches.at(-1)?.status).toBe('FAILED');
  });

  test('account configuration errors (e.g. undecryptable credentials) are permanent', async () => {
    const h = syncHarness({ adapter: adapter('SHOPEE') });
    const proc = new SyncProcessor({
      jobs: { findById: async () => ({ ...(await h.proc['d'].jobs.findById('j1'))! }), update: async () => undefined },
      log,
      getAccountContext: async () => {
        throw new Error('Unsupported state or unable to authenticate data');
      },
      upsert: async () => ({ productId: 'x', created: true, priceChanged: false }),
      staleProducts: async () => [],
      onSuccess: async () => undefined
    });
    expect(proc.run('j1', 1, false)).rejects.toBeInstanceOf(PermanentSyncError);
  });

  test('non-retryable provider errors become permanent', async () => {
    const ad = adapter('SHOPEE', {
      searchProducts: async () => {
        throw new ProviderError('SHOPEE', 'invalid signature', false, '10020');
      }
    });
    const h = syncHarness({ adapter: ad });
    expect(h.proc.run('j1', 1, false)).rejects.toBeInstanceOf(PermanentSyncError);
    await Bun.sleep(1);
    expect(h.patches.at(-1)?.status).toBe('FAILED');
  });
});
