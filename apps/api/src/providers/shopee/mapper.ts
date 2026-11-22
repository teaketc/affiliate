import type { NormalizedProduct } from '../types';
import { fixed, int, num, rate, str, unixSeconds } from '../util';
import type { ProductOfferNode } from './queries';

/** Map one productOfferV2 node to the neutral shape. */
export function mapShopeeNode(node: ProductOfferNode, currency: string): NormalizedProduct {
  const price = num(node.price) ?? num(node.priceMin) ?? 0;
  // priceDiscountRate is an integer percentage (e.g. 25 => 25%)
  const discountPct = num(node.priceDiscountRate) ?? 0;
  const discount = Math.min(Math.max(discountPct / 100, 0), 0.99);
  const original = discount > 0 ? price / (1 - discount) : null;
  const commissionRate = rate(node.commissionRate) ?? 0;
  const rating = num(node.ratingStar);
  const externalId = String(node.itemId);
  const start = unixSeconds(node.periodStartTime);
  const end = unixSeconds(node.periodEndTime);
  const catIds = node.productCatIds ?? [];

  return {
    externalId,
    name: node.productName.trim(),
    productUrl: node.productLink,
    offerLink: str(node.offerLink),
    imageUrl: str(node.imageUrl),
    images: node.imageUrl ? [node.imageUrl] : [],
    shopId: str(node.shopId),
    shopName: str(node.shopName),
    brandName: null,
    currency,
    price: fixed(price, 2, 0),
    originalPrice: original === null ? null : fixed(original, 2, 0),
    discountRate: fixed(discount, 4, 0, 1),
    commissionRate: fixed(commissionRate, 4, 0, 1),
    commissionAmount: num(node.commission) === null ? null : fixed(num(node.commission) ?? 0, 2, 0),
    rating: rating === null ? null : fixed(rating, 2, 0, 5),
    salesCount: int(node.sales) ?? 0,
    stock: null,
    // productCatIds is ordered L1 → L3
    categories: catIds.map((id, i) => ({
      externalId: String(id),
      name: null,
      level: i + 1,
      parentExternalId: i > 0 ? String(catIds[i - 1]) : null
    })),
    variants:
      num(node.priceMin) !== null && num(node.priceMax) !== null && num(node.priceMin) !== num(node.priceMax)
        ? [
            { externalId: `${externalId}:min`, name: 'Lowest price option', price: fixed(num(node.priceMin) ?? 0, 2, 0), originalPrice: null, stock: null, attributes: { derived: true } },
            { externalId: `${externalId}:max`, name: 'Highest price option', price: fixed(num(node.priceMax) ?? 0, 2, 0), originalPrice: null, stock: null, attributes: { derived: true } }
          ]
        : [],
    promotions:
      start || end
        ? [
            {
              type: 'SHOPEE_OFFER_PERIOD',
              externalId: `${externalId}:${start?.getTime() ?? 0}`,
              name: 'Shopee commission offer period',
              discountRate: fixed(discount, 4, 0, 1),
              commissionRate: fixed(commissionRate, 4, 0, 1),
              startsAt: start,
              endsAt: end,
              metadata: {}
            }
          ]
        : [],
    raw: node as unknown as Record<string, unknown>
  };
}
