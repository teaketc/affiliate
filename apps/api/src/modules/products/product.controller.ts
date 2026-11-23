import { Elysia, t } from 'elysia';
import { ok } from '../../lib/response';
import { IdParams, MarketplaceSchema, OrderSchema, PaginationQuery, ShopTypeSchema, SortBySchema } from '../schemas';
import type { ProductService } from './product.service';

const Price = t.Union([t.Number({ minimum: 0, maximum: 9_999_999_999.99 }), t.Null()]);

export function productController(service: ProductService) {
	return new Elysia({ prefix: '/api/v1/products', tags: ['Products'] })
		.get('/', async ({ query }) => ok(await service.list(query)), {
			query: t.Object({
				...PaginationQuery,
				search: t.Optional(t.String({ maxLength: 200 })),
				marketplace: t.Optional(MarketplaceSchema),
				shopType: t.Optional(ShopTypeSchema),
				sortBy: t.Optional(SortBySchema),
				order: t.Optional(OrderSchema)
			}),
			detail: { summary: 'List products (pagination, search, marketplace / shop type filters, sorting)' }
		})
		.get('/:id', async ({ params }) => ok(await service.get(params.id)), {
			params: IdParams,
			detail: { summary: 'Product detail (includes raw extraction data)' }
		})
		.patch('/:id', async ({ params, body }) => ok(await service.update(params.id, body), 'Product updated'), {
			params: IdParams,
			body: t.Object(
				{
					productName: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
					productImage: t.Optional(t.Union([t.String({ maxLength: 2048 }), t.Null()])),
					productImages: t.Optional(t.Array(t.String({ maxLength: 2048 }), { maxItems: 20 })),
					shopName: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
					shopType: t.Optional(t.Union([ShopTypeSchema, t.Null()])),
					price: t.Optional(Price),
					originalPrice: t.Optional(Price),
					currency: t.Optional(t.Union([t.String({ pattern: '^[A-Za-z]{3}$' }), t.Null()])),
					affiliateUrl: t.Optional(t.String({ minLength: 1, maxLength: 2048 }))
				},
				{ additionalProperties: false }
			),
			detail: { summary: 'Update product fields' }
		})
		.delete('/:id', async ({ params }) => ok(await service.remove(params.id), 'Product deleted'), {
			params: IdParams,
			detail: { summary: 'Delete product (its extraction logs are kept, product_id set to NULL)' }
		});
}
