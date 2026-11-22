import { describe, expect, test } from 'bun:test';
import { ProviderError } from '../../src/lib/errors';
import { LazadaProvider } from '../../src/providers/lazada/lazada.provider';
import { mapLazadaFeedItem } from '../../src/providers/lazada/mapper';
import { lazadaSign } from '../../src/providers/lazada/signer';
import { mapShopeeNode } from '../../src/providers/shopee/mapper';
import { ShopeeProvider } from '../../src/providers/shopee/shopee.provider';
import { shopeeSignature } from '../../src/providers/shopee/signer';
import { LAZADA_FEED_RESPONSE, LAZADA_GETLINK_RESPONSE, SHOPEE_PRODUCT_RESPONSE, jsonResponse } from '../fixtures';

type Call = { url: string; init: RequestInit | undefined };
function fakeFetch(responder: (url: string, init?: RequestInit) => Response) {
  const calls: Call[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return responder(url, init);
  };
  return { fn, calls };
}

const NOW = 1_763_800_000_000;

describe('Lazada mapper', () => {
  test('maps official feed sample', () => {
    const item = LAZADA_FEED_RESPONSE.result.data[0] as Record<string, unknown>;
    const p = mapLazadaFeedItem(item, 'TH');
    expect(p).not.toBeNull();
    expect(p?.externalId).toBe('1');
    expect(p?.price).toBe('599.20');
    expect(p?.commissionRate).toBe('0.1000');
    expect(p?.brandName).toBe('Light Coffee');
    expect(p?.productUrl).toBe('https://www.lazada.co.th/products/i1.html');
    expect(p?.categories[0]?.externalId).toBe('4404');
    const mm = p?.promotions.find((x) => x.type === 'LAZADA_MM_CAMPAIGN');
    expect(mm?.name).toBe('LazMall test campaign');
    expect(mm?.startsAt?.toISOString()).toBe('2023-11-22T17:00:00.000Z'); // +07:00 local
    expect(p?.stock).toBe(2);
  });

  test('rejects items without price', () => {
    expect(mapLazadaFeedItem({ productId: '1', productName: 'x' }, 'TH')).toBeNull();
  });
});

describe('LazadaProvider', () => {
  const creds = { appKey: '100000', appSecret: 'lzsecret', userToken: 'ut-123' };

  test('searchProducts signs request with all params and parses feed', async () => {
    const f = fakeFetch(() => jsonResponse(LAZADA_FEED_RESPONSE));
    const p = new LazadaProvider({ endpoint: 'https://api.lazada.co.th/rest', region: 'TH', credentials: creds, timeoutMs: 1000, fetch: f.fn, now: () => NOW });
    const page = await p.searchProducts({ page: 1, limit: 20, categoryExternalId: '4404' });
    expect(page.items).toHaveLength(1);

    const url = new URL(f.calls[0]?.url ?? '');
    expect(url.origin + url.pathname).toBe('https://api.lazada.co.th/rest/marketing/product/feed');
    const params = Object.fromEntries(url.searchParams.entries());
    expect(params).toMatchObject({ offerType: '1', page: '1', limit: '20', categoryL1: '4404', userToken: 'ut-123', app_key: '100000', sign_method: 'sha256', timestamp: String(NOW) });
    const { sign, ...rest } = params;
    expect(sign).toBe(lazadaSign('/marketing/product/feed', rest, 'lzsecret'));
  });

  test('keyword filters locally (feed has no keyword param)', async () => {
    const f = fakeFetch(() => jsonResponse(LAZADA_FEED_RESPONSE));
    const p = new LazadaProvider({ endpoint: 'https://api.lazada.co.th/rest', region: 'TH', credentials: creds, timeoutMs: 1000, fetch: f.fn });
    expect((await p.searchProducts({ page: 1, limit: 20, keyword: 'coffee' })).items).toHaveLength(1);
    expect((await p.searchProducts({ page: 1, limit: 20, keyword: 'nope' })).items).toHaveLength(0);
    expect(new URL(f.calls[0]?.url ?? '').searchParams.has('keyword')).toBe(false);
  });

  test('generateLink uses productId + subIds and trims the link', async () => {
    const f = fakeFetch(() => jsonResponse(LAZADA_GETLINK_RESPONSE));
    const p = new LazadaProvider({ endpoint: 'https://api.lazada.co.th/rest', region: 'TH', credentials: creds, timeoutMs: 1000, fetch: f.fn });
    const link = await p.generateLink({ externalProductId: '2117070236', subIds: ['camp1', 'fb'] });
    expect(link.shortLink).toBe('https://c.lazada.co.th/t/c.YXZuGj');
    const q = new URL(f.calls[0]?.url ?? '').searchParams;
    expect(q.get('inputType')).toBe('productId');
    expect(q.get('inputValue')).toBe('2117070236');
    expect(q.get('subId1')).toBe('camp1');
    expect(q.get('subId2')).toBe('fb');
  });

  test('error code maps to ProviderError (ApiCallLimit retryable)', async () => {
    const f = fakeFetch(() => jsonResponse({ code: 'ApiCallLimit', message: 'too fast', request_id: 'x' }));
    const p = new LazadaProvider({ endpoint: 'https://api.lazada.co.th/rest', region: 'TH', credentials: creds, timeoutMs: 1000, fetch: f.fn });
    const err = await p.testConnection().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
  });

  test('IncompleteSignature is not retryable', async () => {
    const f = fakeFetch(() => jsonResponse({ code: 'IncompleteSignature', message: 'bad sign' }));
    const p = new LazadaProvider({ endpoint: 'https://api.lazada.co.th/rest', region: 'TH', credentials: creds, timeoutMs: 1000, fetch: f.fn });
    const err = (await p.testConnection().catch((e: unknown) => e)) as ProviderError;
    expect(err.retryable).toBe(false);
    expect(err.providerCode).toBe('IncompleteSignature');
  });
});

describe('Shopee mapper', () => {
  test('derives original price from priceDiscountRate and variants from min/max', () => {
    const node = SHOPEE_PRODUCT_RESPONSE.data.productOfferV2.nodes[0];
    if (!node) throw new Error('fixture');
    const p = mapShopeeNode(node, 'THB');
    expect(p.price).toBe('299.00');
    expect(p.originalPrice).toBe('398.67');
    expect(p.discountRate).toBe('0.2500');
    expect(p.commissionRate).toBe('0.1200');
    expect(p.rating).toBe('4.80');
    expect(p.categories.map((c) => c.level)).toEqual([1, 2, 3]);
    expect(p.categories[2]?.parentExternalId).toBe('100535');
    expect(p.variants).toHaveLength(2);
    expect(p.promotions[0]?.endsAt?.getTime()).toBe(1_800_000_000_000);
  });
});

describe('ShopeeProvider', () => {
  const creds = { appId: '15012345', secret: 'shsecret' };

  test('signs the exact body and parses productOfferV2', async () => {
    const f = fakeFetch(() => jsonResponse(SHOPEE_PRODUCT_RESPONSE));
    const p = new ShopeeProvider({ endpoint: 'https://open-api.affiliate.shopee.co.th/graphql', credentials: creds, currency: 'THB', timeoutMs: 1000, fetch: f.fn, now: () => NOW });
    const res = await p.searchProducts({ keyword: 'หูฟัง', page: 1, limit: 20 });
    expect(res.items).toHaveLength(1);
    const call = f.calls[0];
    const body = String(call?.init?.body);
    const auth = new Headers(call?.init?.headers).get('authorization') ?? '';
    const ts = Math.floor(NOW / 1000);
    expect(auth).toBe(`SHA256 Credential=15012345, Timestamp=${ts}, Signature=${shopeeSignature('15012345', ts, body, 'shsecret')}`);
    expect(JSON.parse(body).variables).toMatchObject({ keyword: 'หูฟัง', page: 1, limit: 20, sortType: 1 });
  });

  test('generateShortLink passes originUrl and max 5 subIds', async () => {
    const f = fakeFetch(() => jsonResponse({ data: { generateShortLink: { shortLink: 'https://s.shopee.co.th/xyz' } } }));
    const p = new ShopeeProvider({ endpoint: 'https://open-api.affiliate.shopee.co.th/graphql', credentials: creds, currency: 'THB', timeoutMs: 1000, fetch: f.fn });
    const link = await p.generateLink({ originUrl: 'https://shopee.co.th/product/1/2', subIds: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(link.shortLink).toBe('https://s.shopee.co.th/xyz');
    const vars = JSON.parse(String(f.calls[0]?.init?.body)).variables;
    expect(vars.subIds).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('GraphQL error 10030 is retryable rate limit', async () => {
    const f = fakeFetch(() => jsonResponse({ errors: [{ message: 'rate limit', extensions: { code: 10030, message: 'Rate limit exceeded' } }] }));
    const p = new ShopeeProvider({ endpoint: 'https://open-api.affiliate.shopee.co.th/graphql', credentials: creds, currency: 'THB', timeoutMs: 1000, fetch: f.fn });
    const err = (await p.testConnection().catch((e: unknown) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.retryable).toBe(true);
    expect(err.providerCode).toBe('10030');
  });

  test('schema drift fails loudly (non-retryable)', async () => {
    const f = fakeFetch(() => jsonResponse({ data: { productOfferV2: { nodes: [{ itemId: 1 }], pageInfo: { page: 1, limit: 1, hasNextPage: false } } } }));
    const p = new ShopeeProvider({ endpoint: 'https://open-api.affiliate.shopee.co.th/graphql', credentials: creds, currency: 'THB', timeoutMs: 1000, fetch: f.fn });
    const err = (await p.searchProducts({ page: 1, limit: 1 }).catch((e: unknown) => e)) as ProviderError;
    expect(err.message).toContain('schema validation');
    expect(err.retryable).toBe(false);
  });

  test('HTTP 503 is retryable, network error is retryable', async () => {
    const p1 = new ShopeeProvider({ endpoint: 'https://open-api.affiliate.shopee.co.th/graphql', credentials: creds, currency: 'THB', timeoutMs: 1000, fetch: fakeFetch(() => new Response('x', { status: 503 })).fn });
    expect(((await p1.testConnection().catch((e: unknown) => e)) as ProviderError).retryable).toBe(true);
    const p2 = new ShopeeProvider({
      endpoint: 'https://open-api.affiliate.shopee.co.th/graphql', credentials: creds, currency: 'THB', timeoutMs: 1000,
      fetch: async () => { throw new TypeError('fetch failed'); }
    });
    expect(((await p2.testConnection().catch((e: unknown) => e)) as ProviderError).retryable).toBe(true);
  });
});
