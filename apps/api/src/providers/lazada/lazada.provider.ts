import type { LazadaCredentials } from '@affiliate/shared';
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
import { str } from '../util';
import { mapLazadaFeedItem } from './mapper';
import { lazadaSign } from './signer';

export interface LazadaProviderOptions {
  /** Gateway, e.g. https://api.lazada.co.th/rest */
  endpoint: string;
  region: string;
  credentials: LazadaCredentials;
  timeoutMs: number;
  fetch?: FetchFn;
  now?: () => number;
  beforeRequest?: () => Promise<void>;
}

const PATH_PRODUCT_FEED = '/marketing/product/feed';
const PATH_GET_LINK = '/marketing/getlink';

/** Lazada Open Platform error codes that are worth retrying. */
const RETRYABLE = new Set(['ApiCallLimit', 'ServiceTimeout', 'ISP.ServiceUnavailable', 'InternalError']);

export class LazadaProvider implements AffiliateProviderAdapter {
  readonly marketplace = 'LAZADA' as const;
  readonly maxSubIds = 6;
  private readonly fetchFn: FetchFn;
  private readonly now: () => number;

  constructor(private readonly opts: LazadaProviderOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  /**
   * The product feed has no keyword parameter (official params: offerType, categoryL1, mmCampaignId,
   * limit, page, userToken, productIds, dmInviteId). Keyword filtering is therefore applied locally
   * on the returned page.
   */
  async searchProducts(params: ProductSearchParams): Promise<ProviderPage> {
    const q: Record<string, string> = {
      offerType: '1',
      page: String(params.page),
      limit: String(Math.min(params.limit, 100))
    };
    if (params.categoryExternalId) q.categoryL1 = params.categoryExternalId;
    const result = await this.call(PATH_PRODUCT_FEED, q);
    const data = Array.isArray(result.data) ? result.data : [];
    let items = data
      .filter(isRecord)
      .map((i) => mapLazadaFeedItem(i, this.opts.region))
      .filter((p): p is NormalizedProduct => p !== null);
    if (params.keyword) {
      const kw = params.keyword.toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(kw) || (p.brandName ?? '').toLowerCase().includes(kw));
    }
    return { items, hasNextPage: data.length >= Number(q.limit) };
  }

  async getProductsByIds(externalIds: string[]): Promise<NormalizedProduct[]> {
    const ids = externalIds.filter((id) => /^\d+$/.test(id));
    const out: NormalizedProduct[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const result = await this.call(PATH_PRODUCT_FEED, {
        offerType: '1',
        page: '1',
        limit: String(chunk.length),
        productIds: chunk.join(',')
      });
      const data = Array.isArray(result.data) ? result.data : [];
      for (const item of data.filter(isRecord)) {
        const p = mapLazadaFeedItem(item, this.opts.region);
        if (p) out.push(p);
      }
    }
    return out;
  }

  async generateLink(input: GenerateLinkInput): Promise<GeneratedLink> {
    const params: Record<string, string> = input.externalProductId
      ? { inputType: 'productId', inputValue: input.externalProductId }
      : input.originUrl
        ? { inputType: 'url', inputValue: input.originUrl }
        : (() => {
            throw new ProviderError('LAZADA', 'productId or originUrl is required', false);
          })();
    input.subIds.slice(0, this.maxSubIds).forEach((s, i) => {
      if (s) params[`subId${i + 1}`] = s;
    });

    const result = await this.call(PATH_GET_LINK, params);
    const data = isRecord(result.data) ? result.data : {};
    const listKey = params.inputType === 'productId' ? 'product_batch_get_link_info_list' : 'url_batch_get_link_info_list';
    const list = data[listKey];
    // the official sample shows arrays for product lists and a single object for url lists
    const first: unknown = Array.isArray(list) ? list[0] : list;
    const link = isRecord(first) ? str(first.regular_promotion_link) : null;
    if (!link) {
      const err = isRecord(data.error_info_list) ? data.error_info_list : Array.isArray(data.error_info_list) ? data.error_info_list[0] : undefined;
      const msg = isRecord(err) ? `${str(err.error_msg) ?? 'link not generated'} (${str(err.error_code) ?? '?'})` : 'link not generated';
      throw new ProviderError('LAZADA', msg, false, isRecord(err) ? (str(err.error_code) ?? undefined) : undefined);
    }
    return { shortLink: link, raw: isRecord(first) ? first : {} };
  }

  async testConnection(): Promise<void> {
    await this.call(PATH_PRODUCT_FEED, { offerType: '1', page: '1', limit: '1' });
  }

  /** Signed GET request; returns `result` object. */
  private async call(path: string, business: Record<string, string>): Promise<Record<string, unknown>> {
    await this.opts.beforeRequest?.();
    const { appKey, appSecret, userToken } = this.opts.credentials;
    const params: Record<string, string> = {
      ...business,
      userToken,
      app_key: appKey,
      timestamp: String(this.now()),
      sign_method: 'sha256'
    };
    params.sign = lazadaSign(path, params, appSecret);
    const url = `${this.opts.endpoint.replace(/\/$/, '')}${path}?${new URLSearchParams(params).toString()}`;

    let res: Response;
    try {
      res = await fetchWithTimeout(this.fetchFn, url, { method: 'GET' }, this.opts.timeoutMs);
    } catch (e) {
      throw new ProviderError('LAZADA', `network error: ${errorMessage(e)}`, true);
    }
    if (res.status === 429 || res.status >= 500) throw new ProviderError('LAZADA', `HTTP ${res.status}`, true);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ProviderError('LAZADA', `HTTP ${res.status}: non-JSON response`, false);
    }
    if (!isRecord(json)) throw new ProviderError('LAZADA', 'unexpected response shape', false);

    const code = str(json.code);
    if (code !== '0') {
      const message = str(json.message) ?? 'unknown error';
      throw new ProviderError('LAZADA', `${code ?? '?'}: ${message}`, code !== null && RETRYABLE.has(code), code ?? undefined);
    }
    const result = json.result;
    if (!isRecord(result)) throw new ProviderError('LAZADA', 'missing result object', false);
    return result;
  }
}
