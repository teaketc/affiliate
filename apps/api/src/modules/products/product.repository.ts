import { Prisma, type PrismaClient } from '@prisma/client';
import type { Marketplace, ProductSort } from '@affiliate/shared';
import type { NormalizedProduct } from '../../providers/types';

export interface ProductFilter {
  q?: string;
  marketplace?: Marketplace;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  /** fraction 0..1 */
  minDiscountRate?: number;
  /** fraction 0..1 */
  minCommissionRate?: number;
  sort: ProductSort;
  limit: number;
  offset: number;
}

export const productSummaryInclude = { provider: { select: { code: true } } } satisfies Prisma.ProductInclude;
export type ProductWithProvider = Prisma.ProductGetPayload<{ include: typeof productSummaryInclude }>;

export const productDetailInclude = {
  provider: { select: { code: true } },
  images: { orderBy: { position: 'asc' } },
  variants: { orderBy: { price: 'asc' } },
  categories: { include: { category: { select: { id: true, name: true } } } },
  promotions: { orderBy: { endsAt: 'desc' }, take: 20 }
} satisfies Prisma.ProductInclude;
export type ProductDetail = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

export interface UpsertResult {
  productId: string;
  created: boolean;
  priceChanged: boolean;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class ProductRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Filtered/sorted id page using one parameterised SQL statement so full-text ranking,
   * trigram fallback and numeric filters share the same plan. All values are bound parameters.
   */
  async search(f: ProductFilter): Promise<{ ids: string[]; total: number }> {
    const where: Prisma.Sql[] = [Prisma.sql`p.is_active = true`];
    const tsq = f.q ? Prisma.sql`websearch_to_tsquery('simple', ${f.q})` : null;

    if (f.q && tsq) {
      where.push(Prisma.sql`(p.search_vector @@ ${tsq} OR p.name ILIKE ${`%${escapeLike(f.q)}%`})`);
    }
    if (f.marketplace) where.push(Prisma.sql`ap.code = ${f.marketplace}::"Marketplace"`);
    if (f.categoryId) {
      where.push(
        Prisma.sql`EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ${f.categoryId}::uuid)`
      );
    }
    if (f.minPrice !== undefined) where.push(Prisma.sql`p.price >= ${f.minPrice}`);
    if (f.maxPrice !== undefined) where.push(Prisma.sql`p.price <= ${f.maxPrice}`);
    if (f.minDiscountRate !== undefined) where.push(Prisma.sql`p.discount_rate >= ${f.minDiscountRate}`);
    if (f.minCommissionRate !== undefined) where.push(Prisma.sql`p.commission_rate >= ${f.minCommissionRate}`);

    const order = (() => {
      switch (f.sort) {
        case 'price_asc':
          return Prisma.sql`p.price ASC, p.id`;
        case 'price_desc':
          return Prisma.sql`p.price DESC, p.id`;
        case 'discount_desc':
          return Prisma.sql`p.discount_rate DESC, p.id`;
        case 'commission_desc':
          return Prisma.sql`p.commission_rate DESC, p.id`;
        case 'sales_desc':
          return Prisma.sql`p.sales_count DESC, p.id`;
        case 'relevance':
          return tsq && f.q
            ? Prisma.sql`ts_rank(p.search_vector, ${tsq}) DESC, similarity(p.name, ${f.q}) DESC, p.sales_count DESC, p.id`
            : Prisma.sql`p.sales_count DESC, p.id`;
        case 'updated_desc':
          return Prisma.sql`p.updated_at DESC, p.id`;
      }
    })();

    const rows = await this.db.$queryRaw<{ id: string; total: bigint }[]>`
      SELECT p.id, count(*) OVER() AS total
      FROM products p
      JOIN affiliate_providers ap ON ap.id = p.provider_id
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${order}
      LIMIT ${f.limit} OFFSET ${f.offset}`;

    if (rows.length === 0 && f.offset > 0) {
      // page past the end: still report the real total
      const [c] = await this.db.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS total FROM products p JOIN affiliate_providers ap ON ap.id = p.provider_id
        WHERE ${Prisma.join(where, ' AND ')}`;
      return { ids: [], total: Number(c?.total ?? 0) };
    }
    return { ids: rows.map((r) => r.id), total: Number(rows[0]?.total ?? 0) };
  }

  async findSummaries(ids: string[]): Promise<ProductWithProvider[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.product.findMany({ where: { id: { in: ids } }, include: productSummaryInclude });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ProductWithProvider => r !== undefined);
  }

  findDetail(id: string): Promise<ProductDetail | null> {
    return this.db.product.findUnique({ where: { id }, include: productDetailInclude });
  }

  findById(id: string) {
    return this.db.product.findUnique({ where: { id }, include: productSummaryInclude });
  }

  findExternalIds(providerId: string, limit: number, olderThan: Date): Promise<{ id: string; externalId: string }[]> {
    return this.db.product.findMany({
      where: { providerId, isActive: true, lastSyncedAt: { lt: olderThan } },
      select: { id: true, externalId: true },
      orderBy: { lastSyncedAt: 'asc' },
      take: limit
    });
  }

  /** Idempotent upsert of one provider product incl. images, variants, categories, promotions. */
  async upsertNormalized(providerId: string, p: NormalizedProduct): Promise<UpsertResult> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { providerId_externalId: { providerId, externalId: p.externalId } },
        select: { id: true, price: true, discountRate: true, commissionRate: true }
      });

      const data = {
        name: p.name,
        productUrl: p.productUrl,
        imageUrl: p.imageUrl,
        shopId: p.shopId,
        shopName: p.shopName,
        brandName: p.brandName,
        currency: p.currency,
        price: new Prisma.Decimal(p.price),
        originalPrice: p.originalPrice === null ? null : new Prisma.Decimal(p.originalPrice),
        discountRate: new Prisma.Decimal(p.discountRate),
        commissionRate: new Prisma.Decimal(p.commissionRate),
        commissionAmount: p.commissionAmount === null ? null : new Prisma.Decimal(p.commissionAmount),
        rating: p.rating === null ? null : new Prisma.Decimal(p.rating),
        salesCount: p.salesCount,
        stock: p.stock,
        isActive: true,
        raw: p.raw as Prisma.InputJsonObject,
        lastSyncedAt: new Date()
      };

      const product = await tx.product.upsert({
        where: { providerId_externalId: { providerId, externalId: p.externalId } },
        create: { ...data, providerId, externalId: p.externalId },
        update: data,
        select: { id: true }
      });

      // images: replace set
      await tx.productImage.deleteMany({ where: { productId: product.id, url: { notIn: p.images } } });
      if (p.images.length > 0) {
        await tx.productImage.createMany({
          data: p.images.map((url, position) => ({ productId: product.id, url, position })),
          skipDuplicates: true
        });
      }

      // variants
      for (const v of p.variants) {
        const vd = {
          name: v.name,
          price: new Prisma.Decimal(v.price),
          originalPrice: v.originalPrice === null ? null : new Prisma.Decimal(v.originalPrice),
          stock: v.stock,
          attributes: v.attributes as Prisma.InputJsonObject
        };
        await tx.productVariant.upsert({
          where: { productId_externalId: { productId: product.id, externalId: v.externalId } },
          create: { ...vd, productId: product.id, externalId: v.externalId },
          update: vd
        });
      }

      // categories (ordered parent → child)
      const catIdByExternal = new Map<string, string>();
      for (const c of [...p.categories].sort((a, b) => a.level - b.level)) {
        const parentId = c.parentExternalId ? (catIdByExternal.get(c.parentExternalId) ?? null) : null;
        const cat = await tx.category.upsert({
          where: { providerId_externalId: { providerId, externalId: c.externalId } },
          create: {
            providerId,
            externalId: c.externalId,
            name: c.name ?? `Category ${c.externalId}`,
            slug: c.externalId,
            level: c.level,
            parentId
          },
          update: { ...(c.name ? { name: c.name } : {}), level: c.level, ...(parentId ? { parentId } : {}) },
          select: { id: true }
        });
        catIdByExternal.set(c.externalId, cat.id);
      }
      if (catIdByExternal.size > 0) {
        await tx.productCategory.createMany({
          data: [...catIdByExternal.values()].map((categoryId) => ({ productId: product.id, categoryId })),
          skipDuplicates: true
        });
      }

      // promotions
      for (const promo of p.promotions) {
        const pd = {
          name: promo.name,
          discountRate: promo.discountRate === null ? null : new Prisma.Decimal(promo.discountRate),
          commissionRate: promo.commissionRate === null ? null : new Prisma.Decimal(promo.commissionRate),
          startsAt: promo.startsAt,
          endsAt: promo.endsAt,
          metadata: promo.metadata as Prisma.InputJsonObject
        };
        await tx.promotion.upsert({
          where: { productId_type_externalId: { productId: product.id, type: promo.type, externalId: promo.externalId } },
          create: { ...pd, productId: product.id, type: promo.type, externalId: promo.externalId },
          update: pd
        });
      }

      // price history: only on first sight or when something price-related changed
      const priceChanged =
        !existing ||
        !existing.price.equals(data.price) ||
        !existing.discountRate.equals(data.discountRate) ||
        !existing.commissionRate.equals(data.commissionRate);
      if (priceChanged) {
        await tx.priceHistory.create({
          data: {
            productId: product.id,
            price: data.price,
            originalPrice: data.originalPrice,
            discountRate: data.discountRate,
            commissionRate: data.commissionRate
          }
        });
      }

      return { productId: product.id, created: !existing, priceChanged };
    });
  }
}
