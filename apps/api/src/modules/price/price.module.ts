import { Elysia, t } from 'elysia';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  ErrorResponse,
  Paginated,
  PaginationQuery,
  PriceCompareQuery,
  PriceHistoryDto,
  PriceHistoryQuery,
  ProductSummaryDto,
  PromotionDto,
  totalPages,
  type PaginatedResult,
  type PriceHistoryDto as PriceHistoryDtoT
} from '@affiliate/shared';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { dec, iso } from '../../lib/prisma';
import { authPlugin } from '../../plugins/auth';
import type { AuthService } from '../auth/auth.service';
import { toProductSummary } from '../products/product.mapper';
import { productSummaryInclude } from '../products/product.repository';

export class PriceRepository {
  constructor(private readonly db: PrismaClient) {}

  history(productId: string, since: Date) {
    return this.db.priceHistory.findMany({
      where: { productId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      take: 2000
    });
  }

  stats(productId: string, since: Date) {
    return this.db.priceHistory.aggregate({
      where: { productId, recordedAt: { gte: since } },
      _min: { price: true },
      _max: { price: true },
      _avg: { price: true }
    });
  }

  product(id: string) {
    return this.db.product.findUnique({ where: { id }, select: { id: true, price: true, currency: true } });
  }

  products(ids: string[]) {
    return this.db.product.findMany({ where: { id: { in: ids } }, include: productSummaryInclude });
  }

  async activePromotions(skip: number, take: number) {
    const now = new Date();
    const where: Prisma.PromotionWhereInput = {
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }]
    };
    const [rows, total] = await this.db.$transaction([
      this.db.promotion.findMany({ where, orderBy: { endsAt: 'asc' }, skip, take }),
      this.db.promotion.count({ where })
    ]);
    return { rows, total };
  }
}

export class PriceService {
  constructor(private readonly repo: PriceRepository) {}

  async history(productId: string, days: number): Promise<PriceHistoryDtoT> {
    const product = await this.repo.product(productId);
    if (!product) throw new NotFoundError('Product');
    const since = new Date(Date.now() - days * 86_400_000);
    const [points, stats] = await Promise.all([this.repo.history(productId, since), this.repo.stats(productId, since)]);
    const current = product.price;
    return {
      productId,
      currency: product.currency,
      current: dec(current, 2),
      lowest: dec(stats._min.price ?? current, 2),
      highest: dec(stats._max.price ?? current, 2),
      average: dec(stats._avg.price ?? current, 2),
      points: points.map((p) => ({
        price: dec(p.price, 2),
        originalPrice: dec(p.originalPrice, 2),
        discountRate: dec(p.discountRate, 4),
        commissionRate: dec(p.commissionRate, 4),
        recordedAt: iso(p.recordedAt)
      }))
    };
  }

  /** Side-by-side comparison, cheapest first. */
  async compare(idsCsv: string) {
    const ids = [...new Set(idsCsv.split(',').map((s) => s.trim()).filter(Boolean))];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (ids.length < 2 || ids.length > 10 || !ids.every((i) => uuid.test(i))) {
      throw new BadRequestError('ids must contain 2-10 product UUIDs');
    }
    const rows = await this.repo.products(ids);
    return rows.sort((a, b) => a.price.comparedTo(b.price)).map(toProductSummary);
  }

  async promotions(page: number, limit: number): Promise<PaginatedResult<typeof PromotionDto.static & { productId: string }>> {
    const { rows, total } = await this.repo.activePromotions((page - 1) * limit, limit);
    return {
      data: rows.map((pr) => ({
        id: pr.id,
        productId: pr.productId,
        type: pr.type,
        name: pr.name,
        discountRate: dec(pr.discountRate, 4),
        commissionRate: dec(pr.commissionRate, 4),
        startsAt: iso(pr.startsAt),
        endsAt: iso(pr.endsAt)
      })),
      meta: { page, limit, total, totalPages: totalPages(total, limit) }
    };
  }
}

const security: Record<string, string[]>[] = [{ bearerAuth: [] }, { apiKeyAuth: [] }];

export function priceController(auth: AuthService, price: PriceService) {
  return new Elysia({ prefix: '/api/v1' })
    .use(authPlugin(auth))
    .get('/price-history/:productId', ({ params, query }) => price.history(params.productId, query.days ?? 30), {
      auth: { role: 'VIEWER', scope: 'products:read' },
      params: t.Object({ productId: t.String({ format: 'uuid' }) }),
      query: PriceHistoryQuery,
      response: { 200: PriceHistoryDto, 404: ErrorResponse },
      detail: { tags: ['Price Monitoring'], summary: 'Price history + min/max/avg', security }
    })
    .get('/price-compare', ({ query }) => price.compare(query.ids), {
      auth: { role: 'VIEWER', scope: 'products:read' },
      query: PriceCompareQuery,
      response: { 200: t.Array(ProductSummaryDto), 400: ErrorResponse },
      detail: { tags: ['Price Monitoring'], summary: 'Compare current prices of 2-10 products', security }
    })
    .get('/promotions', ({ query }) => price.promotions(query.page ?? 1, query.limit ?? 20), {
      auth: { role: 'VIEWER', scope: 'products:read' },
      query: PaginationQuery,
      response: { 200: Paginated(t.Composite([PromotionDto, t.Object({ productId: t.String() })])) },
      detail: { tags: ['Price Monitoring'], summary: 'Currently running promotions', security }
    });
}
