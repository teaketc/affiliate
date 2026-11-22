import { Elysia, t } from 'elysia';
import type { PrismaClient } from '@prisma/client';
import { CategoryDto, CategoryQuery, type CategoryQuery as CategoryQueryT } from '@affiliate/shared';
import type { Cache } from '../../lib/cache';
import { authPlugin } from '../../plugins/auth';
import type { AuthService } from '../auth/auth.service';

export class CategoryRepository {
  constructor(private readonly db: PrismaClient) {}

  list(q: CategoryQueryT) {
    return this.db.category.findMany({
      where: {
        ...(q.marketplace ? { provider: { code: q.marketplace } } : {}),
        ...(q.parentId ? { parentId: q.parentId } : {})
      },
      include: { provider: { select: { code: true } }, _count: { select: { products: true } } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      take: 1000
    });
  }
}

export class CategoryService {
  constructor(
    private readonly repo: CategoryRepository,
    private readonly cache: Cache
  ) {}

  list(q: CategoryQueryT): Promise<CategoryDto[]> {
    return this.cache.wrap(`categories:${q.marketplace ?? '*'}:${q.parentId ?? '*'}`, 300, async () =>
      (await this.repo.list(q)).map((c) => ({
        id: c.id,
        marketplace: c.provider.code,
        externalId: c.externalId,
        parentId: c.parentId,
        name: c.name,
        slug: c.slug,
        level: c.level,
        productCount: c._count.products
      }))
    );
  }
}

export function categoryController(auth: AuthService, categories: CategoryService) {
  return new Elysia({ prefix: '/api/v1/categories' }).use(authPlugin(auth)).get('', ({ query }) => categories.list(query), {
    auth: { role: 'VIEWER', scope: 'products:read' },
    query: CategoryQuery,
    response: { 200: t.Array(CategoryDto) },
    detail: { tags: ['Categories'], security: [{ bearerAuth: [] }, { apiKeyAuth: [] }] as Record<string, string[]>[] }
  });
}
