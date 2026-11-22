import type { TSchema, Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ShopeeCredentials } from '@affiliate/shared';
import { ProviderError, errorMessage } from '../../lib/errors';
import { fetchWithTimeout, isRecord, type FetchFn } from '../../lib/http';
import type {
  AffiliateProviderAdapter,
  GenerateLinkInput,
  GeneratedLink,
  NormalizedProduct,
  ProductSearchParams,
  ProviderPage
} from '../types';
import { mapShopeeNode } from './mapper';
import {
  GENERATE_SHORT_LINK,
  PRODUCT_OFFER_V2,
  ProductOfferResponse,
  SHOPEE_SORT,
  ShortLinkResponse
} from './queries';
import { shopeeAuthHeader } from './signer';

export interface ShopeeProviderOptions {
  endpoint: string;
  credentials: ShopeeCredentials;
  currency: string;
  timeoutMs: number;
  fetch?: FetchFn;
  now?: () => number;
  beforeRequest?: () => Promise<void>;
}

/** Codes observed from the Shopee Affiliate API; 10030 = rate limit exceeded. */
const RETRYABLE_CODES = new Set(['10030']);

export class ShopeeProvider implements AffiliateProviderAdapter {
  readonly marketplace = 'SHOPEE' as const;
  readonly maxSubIds = 5;
  private readonly fetchFn: FetchFn;
  private readonly now: () => number;

  constructor(private readonly opts: ShopeeProviderOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  async searchProducts(params: ProductSearchParams): Promise<ProviderPage> {
    const variables: Record<string, unknown> = {
      page: params.page,
      limit: Math.min(params.limit, 50),
      sortType: params.keyword ? SHOPEE_SORT.RELEVANCE_DESC : SHOPEE_SORT.ITEM_SOLD_DESC
    };
    if (params.keyword) variables.keyword = params.keyword;
    if (params.categoryExternalId) variables.productCatId = Number(params.categoryExternalId);
    const data = await this.request(PRODUCT_OFFER_V2, variables, ProductOfferResponse);
    return {
      items: data.productOfferV2.nodes.map((n) => mapShopeeNode(n, this.opts.currency)),
      hasNextPage: data.productOfferV2.pageInfo.hasNextPage
    };
  }

  async getProductsByIds(externalIds: string[]): Promise<NormalizedProduct[]> {
    const out: NormalizedProduct[] = [];
    // productOfferV2 filters by a single itemId per call
    for (const id of externalIds) {
      if (!/^\d+$/.test(id)) continue;
      const data = await this.request(PRODUCT_OFFER_V2, { itemId: Number(id), page: 1, limit: 1 }, ProductOfferResponse);
      for (const n of data.productOfferV2.nodes) out.push(mapShopeeNode(n, this.opts.currency));
    }
    return out;
  }

  async generateLink(input: GenerateLinkInput): Promise<GeneratedLink> {
    if (!input.originUrl) throw new ProviderError('SHOPEE', 'originUrl is required for Shopee links', false);
    const subIds = input.subIds.slice(0, this.maxSubIds);
    const data = await this.request(GENERATE_SHORT_LINK, { originUrl: input.originUrl, subIds }, ShortLinkResponse);
    return { shortLink: data.generateShortLink.shortLink, raw: { shortLink: data.generateShortLink.shortLink } };
  }

  async testConnection(): Promise<void> {
    await this.request(PRODUCT_OFFER_V2, { page: 1, limit: 1 }, ProductOfferResponse);
  }

  private async request<S extends TSchema>(query: string, variables: Record<string, unknown>, schema: S): Promise<Static<S>> {
    await this.opts.beforeRequest?.();
    const body = JSON.stringify({ query, variables });
    const timestamp = Math.floor(this.now() / 1000);
    const { appId, secret } = this.opts.credentials;

    let res: Response;
    try {
      res = await fetchWithTimeout(
        this.fetchFn,
        this.opts.endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: shopeeAuthHeader(appId, timestamp, body, secret)
          },
          body
        },
        this.opts.timeoutMs
      );
    } catch (e) {
      throw new ProviderError('SHOPEE', `network error: ${errorMessage(e)}`, true);
    }

    if (res.status === 429 || res.status >= 500) {
      throw new ProviderError('SHOPEE', `HTTP ${res.status}`, true);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ProviderError('SHOPEE', `HTTP ${res.status}: non-JSON response`, res.status >= 500);
    }
    if (!isRecord(json)) throw new ProviderError('SHOPEE', 'unexpected response shape', false);

    const errors = json.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first: unknown = errors[0];
      const ext = isRecord(first) && isRecord(first.extensions) ? first.extensions : {};
      const code = ext.code === undefined ? undefined : String(ext.code);
      const msg = isRecord(first) && typeof first.message === 'string' ? first.message : 'GraphQL error';
      const extMsg = typeof ext.message === 'string' ? ` (${ext.message})` : '';
      throw new ProviderError('SHOPEE', `${msg}${extMsg}`, code !== undefined && RETRYABLE_CODES.has(code), code);
    }
    if (!res.ok) throw new ProviderError('SHOPEE', `HTTP ${res.status}`, false);

    const data = json.data;
    if (!Value.Check(schema, data)) {
      const first = [...Value.Errors(schema, data)][0];
      throw new ProviderError(
        'SHOPEE',
        `response failed schema validation at ${first?.path ?? '/'}: ${first?.message ?? 'invalid'}`,
        false
      );
    }
    return data;
  }
}
