import { Elysia, t } from 'elysia';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  CampaignDto,
  CampaignStatusSchema,
  CreateCampaignBody,
  ErrorResponse,
  Paginated,
  UpdateCampaignBody,
  totalPages,
  type CampaignDto as CampaignDtoT,
  type CampaignStatus,
  type CreateCampaignBody as CreateCampaignBodyT,
  type PaginatedResult,
  type UpdateCampaignBody as UpdateCampaignBodyT,
  QueryInt
} from '@affiliate/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { dec, iso, isUniqueViolation } from '../../lib/prisma';
import { authPlugin } from '../../plugins/auth';
import { auditAction } from '../../plugins/request-context';
import type { AuthService } from '../auth/auth.service';

const include = { _count: { select: { links: true } } } satisfies Prisma.CampaignInclude;
type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof include }>;

export class CampaignRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(where: Prisma.CampaignWhereInput, skip: number, take: number) {
    const [rows, total] = await this.db.$transaction([
      this.db.campaign.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take }),
      this.db.campaign.count({ where })
    ]);
    return { rows, total };
  }
  async clickCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.affiliateLink.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: ids } },
      _sum: { clickCount: true }
    });
    return new Map(rows.map((r) => [r.campaignId ?? '', r._sum.clickCount ?? 0]));
  }
  findById(id: string) {
    return this.db.campaign.findUnique({ where: { id }, include });
  }
  create(data: Prisma.CampaignUncheckedCreateInput) {
    return this.db.campaign.create({ data, include });
  }
  update(id: string, data: Prisma.CampaignUncheckedUpdateInput) {
    return this.db.campaign.update({ where: { id }, data, include });
  }
  accountExists(id: string) {
    return this.db.affiliateAccount.count({ where: { id } }).then((c) => c > 0);
  }
}

function toDto(c: CampaignRow, clicks: number): CampaignDtoT {
  return {
    id: c.id,
    accountId: c.accountId,
    name: c.name,
    code: c.code,
    description: c.description,
    status: c.status,
    budget: dec(c.budget, 2),
    startsAt: iso(c.startsAt),
    endsAt: iso(c.endsAt),
    linkCount: c._count.links,
    clickCount: clicks,
    createdAt: iso(c.createdAt)
  };
}

function checkDates(startsAt?: string, endsAt?: string) {
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new BadRequestError('endsAt must be after startsAt');
}

export class CampaignService {
  constructor(private readonly repo: CampaignRepository) {}

  async list(q: { page?: number; limit?: number; accountId?: string; status?: CampaignStatus }): Promise<PaginatedResult<CampaignDtoT>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const { rows, total } = await this.repo.list(
      { ...(q.accountId ? { accountId: q.accountId } : {}), ...(q.status ? { status: q.status } : {}) },
      (page - 1) * limit,
      limit
    );
    const clicks = await this.repo.clickCounts(rows.map((r) => r.id));
    return { data: rows.map((r) => toDto(r, clicks.get(r.id) ?? 0)), meta: { page, limit, total, totalPages: totalPages(total, limit) } };
  }

  async create(body: CreateCampaignBodyT): Promise<CampaignDtoT> {
    checkDates(body.startsAt, body.endsAt);
    if (!(await this.repo.accountExists(body.accountId))) throw new NotFoundError('Affiliate account');
    try {
      const row = await this.repo.create({
        accountId: body.accountId,
        name: body.name,
        code: body.code,
        description: body.description ?? null,
        status: body.status ?? 'DRAFT',
        budget: body.budget ? new Prisma.Decimal(body.budget) : null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null
      });
      return toDto(row, 0);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('Campaign code already used for this account');
      throw e;
    }
  }

  async update(id: string, body: UpdateCampaignBodyT): Promise<CampaignDtoT> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Campaign');
    checkDates(body.startsAt ?? existing.startsAt?.toISOString(), body.endsAt ?? existing.endsAt?.toISOString());
    const row = await this.repo.update(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.budget !== undefined ? { budget: new Prisma.Decimal(body.budget) } : {}),
      ...(body.startsAt !== undefined ? { startsAt: new Date(body.startsAt) } : {}),
      ...(body.endsAt !== undefined ? { endsAt: new Date(body.endsAt) } : {})
    });
    const clicks = await this.repo.clickCounts([id]);
    return toDto(row, clicks.get(id) ?? 0);
  }
}

const security = [{ bearerAuth: [] }];

export function campaignController(auth: AuthService, campaigns: CampaignService) {
  return new Elysia({ prefix: '/api/v1/campaigns' })
    .use(authPlugin(auth))
    .get('', ({ query }) => campaigns.list(query), {
      auth: { role: 'VIEWER' },
      query: t.Object({
        page: t.Optional(QueryInt({ minimum: 1 })),
        limit: t.Optional(QueryInt({ minimum: 1, maximum: 100 })),
        accountId: t.Optional(t.String({ format: 'uuid' })),
        status: t.Optional(CampaignStatusSchema)
      }),
      response: { 200: Paginated(CampaignDto) },
      detail: { tags: ['Campaigns'], security }
    })
    .post(
      '',
      async ({ body, request, set }) => {
        const c = await campaigns.create(body);
        auditAction(request, 'campaign.create', { campaignId: c.id });
        set.status = 201;
        return c;
      },
      {
        auth: { role: 'EDITOR' },
        body: CreateCampaignBody,
        response: { 201: CampaignDto, 400: ErrorResponse, 409: ErrorResponse },
        detail: { tags: ['Campaigns'], security }
      }
    )
    .patch(
      '/:id',
      async ({ params, body, request }) => {
        const c = await campaigns.update(params.id, body);
        auditAction(request, 'campaign.update', { campaignId: params.id });
        return c;
      },
      {
        auth: { role: 'EDITOR' },
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body: UpdateCampaignBody,
        response: { 200: CampaignDto },
        detail: { tags: ['Campaigns'], security }
      }
    );
}
