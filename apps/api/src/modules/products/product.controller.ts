import { Elysia, t } from 'elysia';
import {
  ErrorResponse,
  Paginated,
  ProductDetailDto,
  ProductListQuery,
  ProductSearchQuery,
  ProductSummaryDto
} from '@affiliate/shared';
import { authPlugin } from '../../plugins/auth';
import type { AuthService } from '../auth/auth.service';
import type { ProductService } from './product.service';

const security: Record<string, string[]>[] = [{ bearerAuth: [] }, { apiKeyAuth: [] }];

export function productController(auth: AuthService, products: ProductService) {
  return new Elysia({ prefix: '/api/v1/products' })
    .use(authPlugin(auth))
    .get('', ({ query }) => products.list(query), {
      auth: { role: 'VIEWER', scope: 'products:read' },
      query: ProductListQuery,
      response: { 200: Paginated(ProductSummaryDto), 400: ErrorResponse },
      detail: {
        tags: ['Products'],
        summary: 'List products with marketplace / price / discount / commission filters',
        security
      }
    })
    .get('/search', ({ query }) => products.list(query), {
      auth: { role: 'VIEWER', scope: 'products:read' },
      query: ProductSearchQuery,
      response: { 200: Paginated(ProductSummaryDto), 400: ErrorResponse },
      detail: {
        tags: ['Products'],
        summary: 'Full-text search (PostgreSQL tsvector + trigram fallback for Thai)',
        security
      }
    })
    .get('/:id', ({ params }) => products.detail(params.id), {
      auth: { role: 'VIEWER', scope: 'products:read' },
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      response: { 200: ProductDetailDto, 404: ErrorResponse },
      detail: { tags: ['Products'], summary: 'Product detail with images, variants, categories, promotions', security }
    });
}
