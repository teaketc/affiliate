import type { Marketplace } from '@affiliate/shared';

/** Marketplace-neutral product shape produced by every adapter. Money/rates are decimal strings. */
export interface NormalizedProduct {
  externalId: string;
  name: string;
  productUrl: string;
  /** Provider-generated affiliate offer link, if the listing API returns one */
  offerLink: string | null;
  imageUrl: string | null;
  images: string[];
  shopId: string | null;
  shopName: string | null;
  brandName: string | null;
  currency: string;
  price: string;
  originalPrice: string | null;
  /** 0..1 */
  discountRate: string;
  /** 0..1 */
  commissionRate: string;
  commissionAmount: string | null;
  rating: string | null;
  salesCount: number;
  stock: number | null;
  categories: NormalizedCategory[];
  variants: NormalizedVariant[];
  promotions: NormalizedPromotion[];
  raw: Record<string, unknown>;
}

export interface NormalizedCategory {
  externalId: string;
  name: string | null;
  level: number;
  parentExternalId: string | null;
}

export interface NormalizedVariant {
  externalId: string;
  name: string;
  price: string;
  originalPrice: string | null;
  stock: number | null;
  attributes: Record<string, unknown>;
}

export interface NormalizedPromotion {
  type: string;
  externalId: string;
  name: string;
  discountRate: string | null;
  commissionRate: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  metadata: Record<string, unknown>;
}

export interface ProductSearchParams {
  keyword?: string;
  categoryExternalId?: string;
  page: number;
  limit: number;
}

export interface ProviderPage {
  items: NormalizedProduct[];
  hasNextPage: boolean;
}

export interface GenerateLinkInput {
  /** Marketplace URL (Shopee) or product URL (Lazada inputType=url) */
  originUrl?: string;
  /** Marketplace product id (Lazada inputType=productId) */
  externalProductId?: string;
  subIds: string[];
}

export interface GeneratedLink {
  shortLink: string;
  /** Raw provider payload for auditing/debugging (no secrets) */
  raw: Record<string, unknown>;
}

/** Contract every marketplace adapter implements. Adapters do HTTP only — no DB access. */
export interface AffiliateProviderAdapter {
  readonly marketplace: Marketplace;
  /** Max sub ids the marketplace accepts */
  readonly maxSubIds: number;
  searchProducts(params: ProductSearchParams): Promise<ProviderPage>;
  getProductsByIds(externalIds: string[]): Promise<NormalizedProduct[]>;
  generateLink(input: GenerateLinkInput): Promise<GeneratedLink>;
  /** Cheap authenticated call used by "Test connection" in the dashboard */
  testConnection(): Promise<void>;
}
