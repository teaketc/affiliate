import { Elysia } from 'elysia';
import type { PrismaClient } from '@prisma/client';
import { AnalyticsOverviewDto, AnalyticsQuery, type AnalyticsOverviewDto as Overview, type Marketplace } from '@affiliate/shared';
import type { Cache } from '../../lib/cache';
import { authPlugin } from '../../plugins/auth';
import type { AuthService } from '../auth/auth.service';

export class AnalyticsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly cache: Cache
  ) {}

  overview(days: number): Promise<Overview> {
    return this.cache.wrap(`analytics:overview:${days}`, 60, () => this.compute(days));
  }

  private async compute(days: number): Promise<Overview> {
    const since = new Date(Date.now() - days * 86_400_000);
    const dayAgo = new Date(Date.now() - 86_400_000);

    const [products, activeAccounts, links, clicks, activeCampaigns, byMarketplace, clicksByDay, topLinks, sync] = await Promise.all([
      this.db.product.count({ where: { isActive: true } }),
      this.db.affiliateAccount.count({ where: { status: 'ACTIVE' } }),
      this.db.affiliateLink.count(),
      this.db.clickEvent.count({ where: { createdAt: { gte: since } } }),
      this.db.campaign.count({ where: { status: 'ACTIVE' } }),
      this.db.$queryRaw<{ marketplace: Marketplace; products: bigint; links: bigint; clicks: bigint; avg_rate: string | null }[]>`
        SELECT ap.code AS marketplace,
          (SELECT count(*) FROM products p WHERE p.provider_id = ap.id AND p.is_active) AS products,
          (SELECT count(*) FROM affiliate_links l JOIN affiliate_accounts a ON a.id = l.account_id WHERE a.provider_id = ap.id) AS links,
          (SELECT count(*) FROM click_events c JOIN affiliate_links l ON l.id = c.link_id JOIN affiliate_accounts a ON a.id = l.account_id
             WHERE a.provider_id = ap.id AND c.created_at >= ${since}) AS clicks,
          (SELECT avg(p.commission_rate)::numeric(6,4)::text FROM products p WHERE p.provider_id = ap.id AND p.is_active) AS avg_rate
        FROM affiliate_providers ap ORDER BY ap.code`,
      this.db.$queryRaw<{ date: string; clicks: bigint }[]>`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(c.id) AS clicks
        FROM generate_series(date_trunc('day', ${since}::timestamptz), date_trunc('day', now()), interval '1 day') AS d(day)
        LEFT JOIN click_events c ON c.created_at >= d.day AND c.created_at < d.day + interval '1 day'
        GROUP BY d.day ORDER BY d.day`,
      this.db.$queryRaw<{ id: string; product_name: string | null; short_link: string; clicks: bigint }[]>`
        SELECT l.id, p.name AS product_name, l.short_link, count(c.id) AS clicks
        FROM affiliate_links l
        LEFT JOIN products p ON p.id = l.product_id
        JOIN click_events c ON c.link_id = l.id AND c.created_at >= ${since}
        GROUP BY l.id, p.name ORDER BY clicks DESC LIMIT 10`,
      this.db.syncJob.groupBy({ by: ['status'], where: { createdAt: { gte: dayAgo } }, _count: { _all: true } })
    ]);

    const syncCount = (s: string) => sync.find((r) => r.status === s)?._count._all ?? 0;
    return {
      totals: { products, activeAccounts, links, clicks, activeCampaigns },
      byMarketplace: byMarketplace.map((m) => ({
        marketplace: m.marketplace,
        products: Number(m.products),
        links: Number(m.links),
        clicks: Number(m.clicks),
        avgCommissionRate: m.avg_rate ?? '0.0000'
      })),
      clicksByDay: clicksByDay.map((r) => ({ date: r.date, clicks: Number(r.clicks) })),
      topLinks: topLinks.map((r) => ({ id: r.id, productName: r.product_name, shortLink: r.short_link, clicks: Number(r.clicks) })),
      sync: { last24h: { success: syncCount('SUCCESS'), failed: syncCount('FAILED'), running: syncCount('RUNNING') } }
    };
  }
}

export function analyticsController(auth: AuthService, analytics: AnalyticsService) {
  return new Elysia({ prefix: '/api/v1/analytics' }).use(authPlugin(auth)).get('/overview', ({ query }) => analytics.overview(query.days ?? 30), {
    auth: { role: 'VIEWER', scope: 'analytics:read' },
    query: AnalyticsQuery,
    response: { 200: AnalyticsOverviewDto },
    detail: { tags: ['Analytics'], security: [{ bearerAuth: [] }, { apiKeyAuth: [] }] as Record<string, string[]>[] }
  });
}
