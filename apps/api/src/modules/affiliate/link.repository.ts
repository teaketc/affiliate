import { Prisma, type PrismaClient } from '@prisma/client';

export const linkInclude = {
  account: { select: { provider: { select: { code: true } } } },
  product: { select: { name: true } },
  campaign: { select: { name: true } }
} satisfies Prisma.AffiliateLinkInclude;
export type LinkRow = Prisma.AffiliateLinkGetPayload<{ include: typeof linkInclude }>;

export interface NewLink {
  accountId: string;
  productId: string | null;
  campaignId: string | null;
  createdById: string | null;
  originUrl: string;
  shortLink: string;
  shortCode: string;
  subIds: string[];
}

export interface LinkRepositoryPort {
  create(data: NewLink): Promise<LinkRow>;
  list(where: { accountId?: string; campaignId?: string; productId?: string }, skip: number, take: number): Promise<{ rows: LinkRow[]; total: number }>;
  findByCode(code: string): Promise<{ id: string; shortLink: string; subIds: string[] } | null>;
  recordClick(linkId: string, click: { ipHash: string; userAgent: string | null; referer: string | null; country: string | null; subIds: Record<string, string> }): Promise<void>;
}

export class LinkRepository implements LinkRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  create(data: NewLink): Promise<LinkRow> {
    return this.db.affiliateLink.create({ data, include: linkInclude });
  }

  async list(where: { accountId?: string; campaignId?: string; productId?: string }, skip: number, take: number) {
    const w: Prisma.AffiliateLinkWhereInput = {
      ...(where.accountId ? { accountId: where.accountId } : {}),
      ...(where.campaignId ? { campaignId: where.campaignId } : {}),
      ...(where.productId ? { productId: where.productId } : {})
    };
    const [rows, total] = await this.db.$transaction([
      this.db.affiliateLink.findMany({ where: w, include: linkInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      this.db.affiliateLink.count({ where: w })
    ]);
    return { rows, total };
  }

  findByCode(code: string) {
    return this.db.affiliateLink.findUnique({ where: { shortCode: code }, select: { id: true, shortLink: true, subIds: true } });
  }

  async recordClick(
    linkId: string,
    click: { ipHash: string; userAgent: string | null; referer: string | null; country: string | null; subIds: Record<string, string> }
  ): Promise<void> {
    await this.db.$transaction([
      this.db.clickEvent.create({ data: { linkId, ...click } }),
      this.db.affiliateLink.update({ where: { id: linkId }, data: { clickCount: { increment: 1 } } })
    ]);
  }
}
