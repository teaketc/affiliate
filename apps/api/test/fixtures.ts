/** Fixtures copied from the official Lazada Open Platform sample responses (open.lazada.com, Nov 2026). */
export const LAZADA_FEED_RESPONSE = {
  result: {
    data: [
      {
        dmCommissionRate: '0.09',
        mmPartnerCommissionRate: '0.01',
        dmInviteStartTime: '2023-11-23 00:00:00',
        mmCampaignDesc: 'test for lazmall campaign',
        totalCommissionAmount: '1',
        crossStoreTotalCommissionRate: '100',
        sellerName: 'seller name',
        discountPrice: '599.2',
        mmCampaignId: '1',
        cpsCommissionAmount: '1000',
        sales7d: '0',
        pictures: [],
        productName: 'test product do not buy9',
        sellerId: '1',
        dmInviteEndTime: '2023-11-23 00:00:00',
        mmWarmupEndDate: '2023-11-23 00:00:00',
        outOfStock: 'false',
        affPartnerCommissionRate: '0.09',
        currency: '₫',
        stock: '2',
        mmWarmupStartDate: '1970-01-01 07:00:00',
        dmInviteName: 'invite name',
        brandName: 'Light Coffee',
        productId: '1',
        categoryL1: '4404',
        mmCampaignEndDate: '2023-11-30 23:59:59',
        sameProductTotalCommissionRate: '100',
        mmPartnerCommissionAmount: '9000',
        bonusOfferFlag: 'true',
        mmCampaignStartDate: '2023-11-23 00:00:00',
        mmCampaignName: 'LazMall test campaign',
        cpsCommissionRate: '0.09',
        brandId: '1',
        affPartnerCommissionAmount: '1000',
        totalCommissionRate: '0.1',
        dmCommissionAmount: '100',
        dmInviteId: '1',
        sameStoreTotalCommissionRate: '100'
      }
    ],
    success: 'true'
  },
  code: '0',
  request_id: '0ba2887315178178017221014'
};

export const LAZADA_GETLINK_RESPONSE = {
  result: {
    error_msg: 'null ',
    data: {
      product_batch_get_link_info_list: [
        {
          dm_commission: 'null ',
          regular_promotion_link: 'https://c.lazada.co.th/t/c.YXZuGj ',
          product_name: 'Naturista ',
          product_id: '2117070236 ',
          regular_commission: '24.1% ',
          mm_promotion_link: 'null '
        }
      ],
      error_info_list: { error_msg: 'offer not found', error_code: '2001', input_value: '375482016' },
      error_count: '1'
    },
    success: {}
  },
  code: '0',
  request_id: '0ba2887315178178017221014'
};

export const SHOPEE_PRODUCT_RESPONSE = {
  data: {
    productOfferV2: {
      nodes: [
        {
          itemId: 22345678901,
          productName: 'หูฟังบลูทูธ Wireless Earbuds',
          commissionRate: '0.12',
          commission: '35.88',
          price: '299',
          priceMin: '299',
          priceMax: '399',
          priceDiscountRate: 25,
          sales: 1520,
          ratingStar: '4.8',
          imageUrl: 'https://cf.shopee.co.th/file/abc',
          shopId: 123456,
          shopName: 'Gadget Shop',
          productLink: 'https://shopee.co.th/product/123456/22345678901',
          offerLink: 'https://s.shopee.co.th/abc',
          productCatIds: [100013, 100535, 101000],
          periodStartTime: 1700000000,
          periodEndTime: 1800000000
        }
      ],
      pageInfo: { page: 1, limit: 50, hasNextPage: false }
    }
  }
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
