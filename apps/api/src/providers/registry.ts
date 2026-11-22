import { Value } from '@sinclair/typebox/value';
import { LazadaCredentials, ShopeeCredentials, type Marketplace } from '@affiliate/shared';
import type { SecretBox } from '../lib/crypto';
import { BadRequestError } from '../lib/errors';
import type { FetchFn } from '../lib/http';
import type { ProviderThrottle } from '../lib/rate-limiter';
import { LazadaProvider } from './lazada/lazada.provider';
import { lazadaRegion } from './lazada/mapper';
import { ShopeeProvider } from './shopee/shopee.provider';
import type { AffiliateProviderAdapter } from './types';

export interface AccountForProvider {
  marketplace: Marketplace;
  region: string;
  endpoint: string;
  credentialsEnc: string;
  rateLimitPerSec: number;
}

const SHOPEE_CURRENCY: Record<string, string> = {
  TH: 'THB', SG: 'SGD', MY: 'MYR', PH: 'PHP', VN: 'VND', ID: 'IDR', BR: 'BRL', TW: 'TWD'
};

/** Validates decrypted credentials against the marketplace's schema. */
export function parseCredentials(marketplace: Marketplace, value: unknown): ShopeeCredentials | LazadaCredentials {
  if (marketplace === 'SHOPEE') {
    if (!Value.Check(ShopeeCredentials, value)) throw new BadRequestError('Shopee credentials require appId and secret');
    return value;
  }
  if (!Value.Check(LazadaCredentials, value)) {
    throw new BadRequestError('Lazada credentials require appKey, appSecret and userToken');
  }
  return value;
}

/** Builds adapters for a stored account. Decrypted secrets live only inside the adapter instance. */
export class ProviderFactory {
  constructor(
    private readonly box: SecretBox,
    private readonly throttle: ProviderThrottle,
    private readonly timeoutMs: number,
    /** Injected in tests to stub marketplace HTTP; defaults to global fetch */
    private readonly fetchFn?: FetchFn
  ) {}

  create(account: AccountForProvider): AffiliateProviderAdapter {
    const creds = parseCredentials(account.marketplace, this.box.decryptJson(account.credentialsEnc));
    const beforeRequest = () => this.throttle.acquire(account.marketplace, account.rateLimitPerSec);
    if (account.marketplace === 'SHOPEE') {
      return new ShopeeProvider({
        endpoint: account.endpoint,
        credentials: creds as ShopeeCredentials,
        currency: SHOPEE_CURRENCY[account.region] ?? 'THB',
        timeoutMs: this.timeoutMs,
        beforeRequest,
        ...(this.fetchFn ? { fetch: this.fetchFn } : {})
      });
    }
    lazadaRegion(account.region); // validates region
    return new LazadaProvider({
      endpoint: account.endpoint,
      region: account.region,
      credentials: creds as LazadaCredentials,
      timeoutMs: this.timeoutMs,
      beforeRequest,
      ...(this.fetchFn ? { fetch: this.fetchFn } : {})
    });
  }
}
