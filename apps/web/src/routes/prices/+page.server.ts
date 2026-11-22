import type { PaginatedResult, ProductSummaryDto, PromotionDto } from '@affiliate/shared';
import { ApiError, api, load as get } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const ids = (event.url.searchParams.get('ids') ?? '').trim();
  const [promotions, discounted, compare] = await Promise.all([
    get<PaginatedResult<PromotionDto & { productId: string }>>(event, '/api/v1/promotions', { limit: 20 }),
    get<PaginatedResult<ProductSummaryDto>>(event, '/api/v1/products', { sort: 'discount_desc', minDiscount: 1, limit: 12 }),
    ids
      ? api<ProductSummaryDto[]>(event, '/api/v1/price-compare', { query: { ids } }).catch((e: unknown) => {
          if (e instanceof ApiError) return e.message;
          throw e;
        })
      : Promise.resolve(null)
  ]);
  return { promotions, discounted, compare, ids };
};
