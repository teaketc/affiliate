import type { Marketplace, ShopType, SortOrder } from '@affiliate/shared';
import { Prisma, type PrismaClient, type Product } from '@prisma/client';
import type { ExtractedProduct } from '../../extractors/types';

export interface ProductListQuery {
	skip: number;
	take: number;
	search?: string;
	marketplace?: Marketplace;
	shopType?: ShopType;
	sortBy: 'createdAt' | 'updatedAt' | 'price' | 'productName';
	order: SortOrder;
}

type Tx = Prisma.TransactionClient;

/** Only fields with a verified (non-null / non-empty) value are written on update. */
function nonNullUpdate(data: ExtractedProduct, existing: Product): Prisma.ProductUpdateInput {
	const update: Prisma.ProductUpdateInput = {
		affiliateUrl: data.affiliateUrl,
		rawData: data.rawData as unknown as Prisma.InputJsonValue,
		extractedAt: data.extractedAt
	};
	if (data.productName !== null) update.productName = data.productName;
	if (data.productImage !== null) update.productImage = data.productImage;
	if (data.productImages.length > 0) update.productImages = data.productImages;
	if (data.shopName !== null) update.shopName = data.shopName;
	if (data.shopType !== null) update.shopType = data.shopType;
	if (data.price !== null) update.price = data.price;
	if (data.originalPrice !== null) update.originalPrice = data.originalPrice;
	if (data.currency !== null) update.currency = data.currency;
	// Never move an existing external ID; only fill it when it was unknown.
	if (data.externalProductId !== null && existing.externalProductId === null) {
		update.externalProductId = data.externalProductId;
	}
	return update;
}

export class ProductRepository {
	constructor(private readonly prisma: PrismaClient) {}

	/** Duplicate detection: (marketplace, externalProductId) first, then (marketplace, canonical URL). */
	async findDuplicate(tx: Tx, data: ExtractedProduct): Promise<Product | null> {
		if (data.externalProductId) {
			const byId = await tx.product.findUnique({
				where: {
					marketplace_externalProductId: { marketplace: data.marketplace, externalProductId: data.externalProductId }
				}
			});
			if (byId) return byId;
		}
		return tx.product.findUnique({
			where: { marketplace_productUrl: { marketplace: data.marketplace, productUrl: data.productUrl } }
		});
	}

	async upsertExtracted(tx: Tx, data: ExtractedProduct & { productName: string }): Promise<{ product: Product; duplicate: boolean }> {
		const existing = await this.findDuplicate(tx, data);
		if (existing) {
			const product = await tx.product.update({ where: { id: existing.id }, data: nonNullUpdate(data, existing) });
			return { product, duplicate: true };
		}
		const product = await tx.product.create({
			data: {
				marketplace: data.marketplace,
				externalProductId: data.externalProductId,
				productName: data.productName,
				productImage: data.productImage,
				productImages: data.productImages,
				shopName: data.shopName,
				shopType: data.shopType,
				price: data.price,
				originalPrice: data.originalPrice,
				currency: data.currency,
				productUrl: data.productUrl,
				affiliateUrl: data.affiliateUrl,
				rawData: data.rawData as unknown as Prisma.InputJsonValue,
				extractedAt: data.extractedAt
			}
		});
		return { product, duplicate: false };
	}

	async list(q: ProductListQuery): Promise<{ items: Product[]; total: number }> {
		const where: Prisma.ProductWhereInput = {};
		if (q.marketplace) where.marketplace = q.marketplace;
		if (q.shopType) where.shopType = q.shopType;
		if (q.search) {
			where.OR = [
				{ productName: { contains: q.search, mode: 'insensitive' } },
				{ shopName: { contains: q.search, mode: 'insensitive' } },
				{ externalProductId: { contains: q.search, mode: 'insensitive' } }
			];
		}
		const orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ [q.sortBy]: q.order }, { id: 'asc' }];
		const [items, total] = await this.prisma.$transaction([
			this.prisma.product.findMany({ where, orderBy, skip: q.skip, take: q.take }),
			this.prisma.product.count({ where })
		]);
		return { items, total };
	}

	findById(id: string): Promise<Product | null> {
		return this.prisma.product.findUnique({ where: { id } });
	}

	update(id: string, data: Prisma.ProductUpdateInput): Promise<Product> {
		return this.prisma.product.update({ where: { id }, data });
	}

	delete(id: string): Promise<Product> {
		return this.prisma.product.delete({ where: { id } });
	}
}
