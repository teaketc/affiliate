import { Value } from '@sinclair/typebox/value';
import { ProductListQuery, type CategoryDto, type PaginatedResult, type ProductSummaryDto } from '@affiliate/shared';
import { load as get } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  // Validate URL params with the shared schema; silently drop invalid ones.
  const raw: Record<string, string> = {};
  for (const [k, v] of event.url.searchParams) if (v !== '') raw[k] = v;
  const converted = Value.Convert(ProductListQuery, raw) as Record<string, unknown>;
  const query: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(converted)) {
    const single = { [k]: v };
    if ((typeof v === 'string' || typeof v === 'number') && Value.Check(ProductListQuery, single)) query[k] = v;
  }
  const path = typeof query.q === 'string' ? '/api/v1/products/search' : '/api/v1/products';
  const [products, categories] = await Promise.all([
    get<PaginatedResult<ProductSummaryDto>>(event, path, { limit: 24, ...query }),
    get<CategoryDto[]>(event, '/api/v1/categories', query.marketplace ? { marketplace: query.marketplace } : undefined)
  ]);
  return { products, categories, query };
};
