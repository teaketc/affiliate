import {
  totalPages,
  type AffiliateLinkDto,
  type GenerateLinkBody,
  type LinkListQuery,
  type Marketplace,
  type PaginatedResult
} from '@affiliate/shared';
import type { Cache } from '../../lib/cache';
import { randomCode, sha256Hex } from '../../lib/crypto';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { iso, isUniqueViolation } from '../../lib/prisma';
import type { Logger } from '../../lib/logger';
import type { AffiliateProviderAdapter } from '../../providers/types';
import type { Principal } from '../auth/principal';
import type { LinkRepositoryPort, LinkRow } from './link.repository';

/** Narrow ports so the service can be unit-tested without a database. */
export interface AffiliateDeps {
  links: LinkRepositoryPort;
  cache: Cache;
  log: Logger;
  publicBaseUrl: string;
  clickSalt: string;
  getAccount(id: string): Promise<{ id: string; status: string; marketplace: Marketplace; providerId: string } | null>;
  getAdapter(accountId: string): Promise<AffiliateProviderAdapter>;
  getProduct(id: string): Promise<{ id: string; providerId: string; externalId: string; productUrl: string } | null>;
  getCampaign(id: string): Promise<{ id: string; accountId: string; code: string; status: string } | null>;
}

const MARKETPLACE_HOSTS: Record<Marketplace, RegExp> = {
  SHOPEE: /(^|\.)(shopee\.(co\.th|sg|com\.my|ph|vn|co\.id|com\.br|tw)|shope\.ee)$/,
  LAZADA: /(^|\.)lazada\.(co\.th|vn|sg|com\.ph|com\.my|co\.id)$/
};

export function assertMarketplaceUrl(marketplace: Marketplace, raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestError('originUrl is not a valid URL');
  }
  if (url.protocol !== 'https:' || !MARKETPLACE_HOSTS[marketplace].test(url.hostname)) {
    throw new BadRequestError(`originUrl must be a ${marketplace} https URL`);
  }
}

export class AffiliateService {
  constructor(private readonly d: AffiliateDeps) {}

  private toDto(l: LinkRow): AffiliateLinkDto {
    return {
      id: l.id,
      accountId: l.accountId,
      marketplace: l.account.provider.code,
      productId: l.productId,
      productName: l.product?.name ?? null,
      campaignId: l.campaignId,
      campaignName: l.campaign?.name ?? null,
      originUrl: l.originUrl,
      shortLink: l.shortLink,
      trackingUrl: `${this.d.publicBaseUrl.replace(/\/$/, '')}/r/${l.shortCode}`,
      subIds: l.subIds,
      clickCount: l.clickCount,
      createdAt: iso(l.createdAt)
    };
  }

  async generate(actor: Principal, body: GenerateLinkBody): Promise<AffiliateLinkDto> {
    if (!body.productId && !body.originUrl) throw new BadRequestError('productId or originUrl is required');

    const account = await this.d.getAccount(body.accountId);
    if (!account) throw new NotFoundError('Affiliate account');
    if (account.status !== 'ACTIVE') throw new BadRequestError('Affiliate account is not active');

    const product = body.productId ? await this.d.getProduct(body.productId) : null;
    if (body.productId && !product) throw new NotFoundError('Product');
    if (product && product.providerId !== account.providerId) {
      throw new BadRequestError('Product belongs to a different marketplace than the account');
    }
    const originUrl = body.originUrl ?? product?.productUrl ?? '';
    assertMarketplaceUrl(account.marketplace, originUrl);

    const campaign = body.campaignId ? await this.d.getCampaign(body.campaignId) : null;
    if (body.campaignId && !campaign) throw new NotFoundError('Campaign');
    if (campaign && campaign.accountId !== account.id) throw new BadRequestError('Campaign belongs to another account');
    if (campaign && campaign.status === 'ENDED') throw new BadRequestError('Campaign has ended');

    const adapter = await this.d.getAdapter(account.id);
    // campaign code always occupies the first sub id slot so conversions can be attributed
    const subIds = [...(campaign ? [campaign.code] : []), ...(body.subIds ?? [])].slice(0, adapter.maxSubIds);

    const generated = await adapter.generateLink({
      originUrl,
      externalProductId: account.marketplace === 'LAZADA' && product ? product.externalId : undefined,
      subIds
    });

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.d.links.create({
          accountId: account.id,
          productId: product?.id ?? null,
          campaignId: campaign?.id ?? null,
          createdById: actor.kind === 'user' ? actor.userId : null,
          originUrl,
          shortLink: generated.shortLink,
          shortCode: randomCode(8),
          subIds
        });
        return this.toDto(row);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    throw new Error('Could not allocate a unique short code');
  }

  async list(q: LinkListQuery): Promise<PaginatedResult<AffiliateLinkDto>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const { rows, total } = await this.d.links.list(
      { accountId: q.accountId, campaignId: q.campaignId, productId: q.productId },
      (page - 1) * limit,
      limit
    );
    return { data: rows.map((r) => this.toDto(r)), meta: { page, limit, total, totalPages: totalPages(total, limit) } };
  }

  /** Resolve a tracking code to the marketplace link and record the click asynchronously. */
  async resolveClick(
    code: string,
    meta: { ip: string | null; userAgent: string | null; referer: string | null; country: string | null; query: Record<string, string | undefined> }
  ): Promise<string | null> {
    if (!/^[A-Za-z0-9]{8}$/.test(code)) return null;
    const link = await this.d.cache.wrap(`link:${code}`, 3600, () => this.d.links.findByCode(code));
    if (!link) return null;

    const subIds: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta.query)) {
      if (/^(sub_?id\d|utm_[a-z]+)$/i.test(k) && v) subIds[k] = v.slice(0, 100);
    }
    void this.d.links
      .recordClick(link.id, {
        ipHash: sha256Hex(`${meta.ip ?? 'unknown'}${this.d.clickSalt}`),
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
        referer: meta.referer?.slice(0, 1000) ?? null,
        country: meta.country,
        subIds
      })
      .catch((e: unknown) => this.d.log.error({ err: e, linkId: link.id }, 'failed to record click'));
    return link.shortLink;
  }
}
