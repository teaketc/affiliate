import { createHash } from 'node:crypto';
import {
  percentToRate,
  totalPages,
  type PaginatedResult,
  type ProductDetailDto,
  type ProductListQuery,
  type ProductSummaryDto
} from '@affiliate/shared';
import type { Cache } from '../../lib/cache';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { toProductDetail, toProductSummary } from './product.mapper';
import type { ProductRepository } from './product.repository';

export const PRODUCT_CACHE_NS = 'products';
const LIST_TTL = 60;
const DETAIL_TTL = 300;

export class ProductService {
  constructor(
    private readonly repo: ProductRepository,
    private readonly cache: Cache
  ) {}

  async list(query: ProductListQuery): Promise<PaginatedResult<ProductSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
      throw new BadRequestError('minPrice must be <= maxPrice');
    }
    const sort = query.sort ?? (query.q ? 'relevance' : 'updated_desc');

    const version = await this.cache.version(PRODUCT_CACHE_NS);
    const key = `products:v${version}:${createHash('sha1').update(JSON.stringify({ ...query, page, limit, sort })).digest('hex')}`;

    return this.cache.wrap(key, LIST_TTL, async () => {
      const { ids, total } = await this.repo.search({
        q: query.q,
        marketplace: query.marketplace,
        categoryId: query.categoryId,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        minDiscountRate: query.minDiscount === undefined ? undefined : percentToRate(query.minDiscount),
        minCommissionRate: query.minCommission === undefined ? undefined : percentToRate(query.minCommission),
        sort,
        limit,
        offset: (page - 1) * limit
      });
      const rows = await this.repo.findSummaries(ids);
      return { data: rows.map(toProductSummary), meta: { page, limit, total, totalPages: totalPages(total, limit) } };
    });
  }

  async detail(id: string): Promise<ProductDetailDto> {
    const version = await this.cache.version(PRODUCT_CACHE_NS);
    const hit = await this.cache.get<ProductDetailDto>(`product:v${version}:${id}`);
    if (hit) return hit;
    const row = await this.repo.findDetail(id);
    if (!row) throw new NotFoundError('Product');
    const dto = toProductDetail(row);
    await this.cache.set(`product:v${version}:${id}`, dto, DETAIL_TTL);
    return dto;
  }

  /** Called after a sync writes products. */
  invalidate(): Promise<void> {
    return this.cache.bump(PRODUCT_CACHE_NS);
  }
}
