import { t } from 'elysia';

/*
 * Literal unions instead of t.UnionEnum: Elysia fills an *optional* UnionEnum with its
 * first member when the value is absent, which would silently apply filters.
 */
export const MarketplaceSchema = t.Union([t.Literal('SHOPEE'), t.Literal('LAZADA')]);
export const ShopTypeSchema = t.Union([t.Literal('MALL'), t.Literal('PREFERRED'), t.Literal('NORMAL')]);
export const StatusSchema = t.Union([t.Literal('SUCCESS'), t.Literal('PARTIAL'), t.Literal('FAILED')]);
export const SortBySchema = t.Union([t.Literal('createdAt'), t.Literal('updatedAt'), t.Literal('price'), t.Literal('productName')]);
export const OrderSchema = t.Union([t.Literal('asc'), t.Literal('desc')]);
export const IdParams = t.Object({ id: t.String({ format: 'uuid' }) });
export const PaginationQuery = {
	page: t.Optional(t.Numeric({ minimum: 1 })),
	pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 }))
};
