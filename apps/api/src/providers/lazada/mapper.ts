import type { NormalizedProduct, NormalizedPromotion } from '../types';
import { fixed, int, localDate, num, rate, str } from '../util';

/** Storefront domain + UTC offset per Lazada venture (dates in responses are venture-local). */
export const LAZADA_REGIONS: Record<string, { domain: string; offset: string; currency: string }> = {
  TH: { domain: 'www.lazada.co.th', offset: '+07:00', currency: 'THB' },
  VN: { domain: 'www.lazada.vn', offset: '+07:00', currency: 'VND' },
  ID: { domain: 'www.lazada.co.id', offset: '+07:00', currency: 'IDR' },
  SG: { domain: 'www.lazada.sg', offset: '+08:00', currency: 'SGD' },
  MY: { domain: 'www.lazada.com.my', offset: '+08:00', currency: 'MYR' },
  PH: { domain: 'www.lazada.com.ph', offset: '+08:00', currency: 'PHP' }
};

export function lazadaRegion(region: string) {
  const r = LAZADA_REGIONS[region];
  if (!r) throw new Error(`Unsupported Lazada region ${region}`);
  return r;
}

/**
 * Map one item of `/marketing/product/feed` → result.data[] (fields per official sample response).
 * The feed has no product URL field, so the public storefront URL `https://{domain}/products/i{id}.html`
 * is used for display only; affiliate links are generated with inputType=productId.
 */
export function mapLazadaFeedItem(item: Record<string, unknown>, region: string): NormalizedProduct | null {
  const r = lazadaRegion(region);
  const externalId = str(item.productId);
  const name = str(item.productName);
  const price = num(item.discountPrice);
  if (!externalId || !name || price === null) return null;

  const pictures = Array.isArray(item.pictures) ? item.pictures.map((p) => str(p)).filter((p): p is string => !!p) : [];
  const commission = rate(item.totalCommissionRate) ?? 0;
  const catL1 = str(item.categoryL1);
  const promotions: NormalizedPromotion[] = [];

  const mmId = str(item.mmCampaignId);
  if (mmId) {
    promotions.push({
      type: 'LAZADA_MM_CAMPAIGN',
      externalId: mmId,
      name: str(item.mmCampaignName) ?? `MM campaign ${mmId}`,
      discountRate: null,
      commissionRate: rate(item.mmPartnerCommissionRate) === null ? null : fixed(rate(item.mmPartnerCommissionRate) ?? 0, 4, 0, 1),
      startsAt: localDate(item.mmCampaignStartDate, r.offset),
      endsAt: localDate(item.mmCampaignEndDate, r.offset),
      metadata: { description: str(item.mmCampaignDesc), warmupStart: str(item.mmWarmupStartDate), warmupEnd: str(item.mmWarmupEndDate) }
    });
  }
  const dmId = str(item.dmInviteId);
  if (dmId) {
    promotions.push({
      type: 'LAZADA_DM_INVITE',
      externalId: dmId,
      name: str(item.dmInviteName) ?? `DM invite ${dmId}`,
      discountRate: null,
      commissionRate: rate(item.dmCommissionRate) === null ? null : fixed(rate(item.dmCommissionRate) ?? 0, 4, 0, 1),
      startsAt: localDate(item.dmInviteStartTime, r.offset),
      endsAt: localDate(item.dmInviteEndTime, r.offset),
      metadata: {}
    });
  }

  const outOfStock = str(item.outOfStock) === 'true';
  return {
    externalId,
    name,
    productUrl: `https://${r.domain}/products/i${externalId}.html`,
    offerLink: null,
    imageUrl: pictures[0] ?? null,
    images: pictures,
    shopId: str(item.sellerId),
    shopName: str(item.sellerName),
    brandName: str(item.brandName),
    currency: r.currency,
    price: fixed(price, 2, 0),
    originalPrice: null,
    discountRate: '0.0000',
    commissionRate: fixed(commission, 4, 0, 1),
    commissionAmount: num(item.totalCommissionAmount) === null ? null : fixed(num(item.totalCommissionAmount) ?? 0, 2, 0),
    rating: null,
    salesCount: int(item.sales7d) ?? 0,
    stock: outOfStock ? 0 : int(item.stock),
    categories: catL1 ? [{ externalId: catL1, name: null, level: 1, parentExternalId: null }] : [],
    variants: [],
    promotions,
    raw: item
  };
}
