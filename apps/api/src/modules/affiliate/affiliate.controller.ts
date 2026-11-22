import { Elysia, t } from 'elysia';
import { AffiliateLinkDto, ErrorResponse, GenerateLinkBody, LinkListQuery, Paginated } from '@affiliate/shared';
import { authPlugin } from '../../plugins/auth';
import { audit, auditAction } from '../../plugins/request-context';
import type { AuthService } from '../auth/auth.service';
import type { AffiliateService } from './affiliate.service';

const security: Record<string, string[]>[] = [{ bearerAuth: [] }, { apiKeyAuth: [] }];

export function affiliateController(auth: AuthService, affiliate: AffiliateService) {
  return new Elysia({ prefix: '/api/v1/affiliate' })
    .use(authPlugin(auth))
    .post(
      '/generate-link',
      async ({ principal, body, request, set }) => {
        const link = await affiliate.generate(principal, body);
        auditAction(request, 'affiliate.generate-link', { linkId: link.id, accountId: link.accountId });
        set.status = 201;
        return link;
      },
      {
        auth: { role: 'EDITOR', scope: 'affiliate:write' },
        body: GenerateLinkBody,
        response: { 201: AffiliateLinkDto, 400: ErrorResponse, 404: ErrorResponse, 502: ErrorResponse },
        detail: {
          tags: ['Affiliate'],
          summary: 'Generate an affiliate link via the marketplace API (Shopee generateShortLink / Lazada /marketing/getlink)',
          security
        }
      }
    )
    .get('/links', ({ query }) => affiliate.list(query), {
      auth: { role: 'VIEWER', scope: 'affiliate:read' },
      query: LinkListQuery,
      response: { 200: Paginated(AffiliateLinkDto) },
      detail: { tags: ['Affiliate'], summary: 'Affiliate link history', security }
    });
}

/** Public click-tracking redirect: GET /r/:code → 302 marketplace link. */
export function redirectController(affiliate: AffiliateService) {
  return new Elysia().get(
    '/r/:code',
    async ({ params, query, request, redirect, status }) => {
      const target = await affiliate.resolveClick(params.code, {
        ip: audit(request).ip,
        userAgent: request.headers.get('user-agent'),
        referer: request.headers.get('referer'),
        // set by Cloudflare / most CDNs; null otherwise
        country: request.headers.get('cf-ipcountry')?.slice(0, 2) ?? null,
        query
      });
      if (!target) return status(404, { error: { code: 'NOT_FOUND', message: 'Link not found' } });
      return redirect(target, 302);
    },
    {
      params: t.Object({ code: t.String({ maxLength: 16 }) }),
      query: t.Record(t.String(), t.String()),
      detail: { tags: ['Tracking'], summary: 'Click tracking redirect (public)' }
    }
  );
}
