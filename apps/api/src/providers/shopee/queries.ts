import { Type, type Static } from '@sinclair/typebox';

/*
 * GraphQL documents for the Shopee Affiliate Open API.
 *
 * VERIFY BEFORE PRODUCTION: Shopee publishes the schema only inside the affiliate dashboard
 * (Open API → Document, requires login). `generateShortLink` is confirmed by a published client;
 * `productOfferV2` argument/field names below follow the dashboard documentation. Every response
 * is validated against `ProductOfferNode` — if Shopee changes a field the sync job fails with a
 * clear validation error instead of writing wrong data.
 */

export const PRODUCT_OFFER_V2 = /* GraphQL */ `
query ProductOfferV2($keyword: String, $productCatId: Int, $itemId: Int64, $sortType: Int, $page: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, productCatId: $productCatId, itemId: $itemId, sortType: $sortType, page: $page, limit: $limit) {
    nodes {
      itemId
      productName
      commissionRate
      commission
      price
      priceMin
      priceMax
      priceDiscountRate
      sales
      ratingStar
      imageUrl
      shopId
      shopName
      productLink
      offerLink
      productCatIds
      periodStartTime
      periodEndTime
    }
    pageInfo { page limit hasNextPage }
  }
}`;

export const GENERATE_SHORT_LINK = /* GraphQL */ `
mutation GenerateShortLink($originUrl: String!, $subIds: [String]) {
  generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) { shortLink }
}`;

/** sortType values from the productOfferV2 documentation */
export const SHOPEE_SORT = {
  RELEVANCE_DESC: 1,
  ITEM_SOLD_DESC: 2,
  PRICE_DESC: 3,
  PRICE_ASC: 4,
  COMMISSION_DESC: 5
} as const;

const NumOrStr = Type.Union([Type.Number(), Type.String()]);
const OptNumOrStr = Type.Optional(Type.Union([Type.Number(), Type.String(), Type.Null()]));
const OptStr = Type.Optional(Type.Union([Type.String(), Type.Null()]));

export const ProductOfferNode = Type.Object({
  itemId: NumOrStr,
  productName: Type.String(),
  commissionRate: OptNumOrStr,
  commission: OptNumOrStr,
  price: OptNumOrStr,
  priceMin: OptNumOrStr,
  priceMax: OptNumOrStr,
  priceDiscountRate: OptNumOrStr,
  sales: OptNumOrStr,
  ratingStar: OptNumOrStr,
  imageUrl: OptStr,
  shopId: OptNumOrStr,
  shopName: OptStr,
  productLink: Type.String(),
  offerLink: OptStr,
  productCatIds: Type.Optional(Type.Union([Type.Array(Type.Number()), Type.Null()])),
  periodStartTime: OptNumOrStr,
  periodEndTime: OptNumOrStr
});
export type ProductOfferNode = Static<typeof ProductOfferNode>;

export const ProductOfferResponse = Type.Object({
  productOfferV2: Type.Object({
    nodes: Type.Array(ProductOfferNode),
    pageInfo: Type.Object({ page: Type.Number(), limit: Type.Number(), hasNextPage: Type.Boolean() })
  })
});
export type ProductOfferResponse = Static<typeof ProductOfferResponse>;

export const ShortLinkResponse = Type.Object({
  generateShortLink: Type.Object({ shortLink: Type.String({ minLength: 1 }) })
});
export type ShortLinkResponse = Static<typeof ShortLinkResponse>;
