import type { Marketplace, ProductDetailDTO, ProductDTO, Paginated, ShopType, SortOrder, UpdateProductInput } from '@affiliate/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { detectMarketplace } from '../../security/marketplaces';
import { validateAffiliateUrl } from '../../security/url-guard';
import { normalizeImageUrl } from '../../extractors/normalizer';
import { pageMeta, paginate, toProductDTO } from '../mappers';
import type { ProductRepository } from './product.repository';

export interface ProductListParams {
	page?: number;
	pageSize?: number;
	search?: string;
	marketplace?: Marketplace;
	shopType?: ShopType;
	sortBy?: 'createdAt' | 'updatedAt' | 'price' | 'productName';
	order?: SortOrder;
}

export class ProductService {
	constructor(private readonly repo: ProductRepository) {}

	async list(params: ProductListParams): Promise<Paginated<ProductDTO>> {
		const { page, pageSize, skip, take } = paginate(params.page, params.pageSize);
		const search = params.search?.trim().slice(0, 200) || undefined;
		const { items, total } = await this.repo.list({
			skip,
			take,
			search,
			marketplace: params.marketplace,
			shopType: params.shopType,
			sortBy: params.sortBy ?? 'createdAt',
			order: params.order ?? 'desc'
		});
		return { items: items.map(toProductDTO), pagination: pageMeta(page, pageSize, total) };
	}

	async get(id: string): Promise<ProductDetailDTO> {
		const p = await this.repo.findById(id);
		if (!p) throw new AppError('NOT_FOUND', 'Product not found');
		return { ...toProductDTO(p), rawData: p.rawData };
	}

	async update(id: string, input: UpdateProductInput): Promise<ProductDTO> {
		const existing = await this.repo.findById(id);
		if (!existing) throw new AppError('NOT_FOUND', 'Product not found');

		const data: Prisma.ProductUpdateInput = {};
		if (input.productName !== undefined) {
			const name = input.productName.trim();
			if (!name) throw new AppError('VALIDATION_ERROR', 'productName cannot be empty');
			data.productName = name;
		}
		if (input.productImage !== undefined) {
			if (input.productImage === null) data.productImage = null;
			else {
				const url = normalizeImageUrl(input.productImage);
				if (!url) throw new AppError('VALIDATION_ERROR', 'productImage must be an http(s) URL');
				data.productImage = url;
			}
		}
		if (input.productImages !== undefined) {
			const urls = input.productImages.map(normalizeImageUrl);
			if (urls.some((u) => u === null)) throw new AppError('VALIDATION_ERROR', 'productImages must be http(s) URLs');
			data.productImages = urls.filter((u): u is string => u !== null);
		}
		if (input.shopName !== undefined) data.shopName = input.shopName === null ? null : input.shopName.trim() || null;
		if (input.shopType !== undefined) data.shopType = input.shopType;
		if (input.price !== undefined) data.price = input.price;
		if (input.originalPrice !== undefined) data.originalPrice = input.originalPrice;
		if (input.currency !== undefined) data.currency = input.currency === null ? null : input.currency.toUpperCase();
		if (input.affiliateUrl !== undefined) {
			const { url, marketplace } = validateAffiliateUrl(input.affiliateUrl);
			if (marketplace !== existing.marketplace || detectMarketplace(url.hostname) !== existing.marketplace) {
				throw new AppError('INVALID_AFFILIATE_URL', `affiliateUrl must be a ${existing.marketplace} URL`);
			}
			data.affiliateUrl = url.toString();
		}
		return toProductDTO(await this.repo.update(id, data));
	}

	async remove(id: string): Promise<{ id: string; deleted: true }> {
		const existing = await this.repo.findById(id);
		if (!existing) throw new AppError('NOT_FOUND', 'Product not found');
		await this.repo.delete(id);
		return { id, deleted: true };
	}
}
