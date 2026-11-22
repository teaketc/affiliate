import type { ProductDetailDto, ProductSummaryDto } from '@affiliate/shared';
import { dec, iso } from '../../lib/prisma';
import { isRecord } from '../../lib/http';
import type { ProductDetail, ProductWithProvider } from './product.repository';

export function toProductSummary(p: ProductWithProvider): ProductSummaryDto {
  return {
    id: p.id,
    marketplace: p.provider.code,
    externalId: p.externalId,
    name: p.name,
    shopName: p.shopName,
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    currency: p.currency,
    price: dec(p.price, 2),
    originalPrice: dec(p.originalPrice, 2),
    discountRate: dec(p.discountRate, 4),
    commissionRate: dec(p.commissionRate, 4),
    commissionAmount: dec(p.commissionAmount, 2),
    rating: dec(p.rating, 2),
    salesCount: p.salesCount,
    updatedAt: iso(p.updatedAt)
  };
}

export function toProductDetail(p: ProductDetail): ProductDetailDto {
  return {
    ...toProductSummary(p),
    description: p.description,
    brandName: p.brandName,
    shopId: p.shopId,
    stock: p.stock,
    images: p.images.map((i) => ({ id: i.id, url: i.url, position: i.position })),
    variants: p.variants.map((v) => ({
      id: v.id,
      externalId: v.externalId,
      name: v.name,
      price: dec(v.price, 2),
      originalPrice: dec(v.originalPrice, 2),
      stock: v.stock,
      attributes: isRecord(v.attributes) ? v.attributes : {}
    })),
    categories: p.categories.map((c) => ({ id: c.category.id, name: c.category.name })),
    promotions: p.promotions.map((pr) => ({
      id: pr.id,
      type: pr.type,
      name: pr.name,
      discountRate: dec(pr.discountRate, 4),
      commissionRate: dec(pr.commissionRate, 4),
      startsAt: iso(pr.startsAt),
      endsAt: iso(pr.endsAt)
    })),
    lastSyncedAt: iso(p.lastSyncedAt)
  };
}
