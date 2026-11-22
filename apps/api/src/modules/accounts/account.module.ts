import { Elysia, t } from 'elysia';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  AccountDto,
  CreateAccountBody,
  ErrorResponse,
  ProviderDto,
  UpdateAccountBody,
  UpdateProviderBody,
  type AccountDto as AccountDtoT,
  type CreateAccountBody as CreateAccountBodyT,
  type Marketplace,
  type ProviderDto as ProviderDtoT,
  type UpdateAccountBody as UpdateAccountBodyT,
  type UpdateProviderBody as UpdateProviderBodyT
} from '@affiliate/shared';
import type { SecretBox } from '../../lib/crypto';
import { BadRequestError, ConflictError, NotFoundError, ProviderError, errorMessage } from '../../lib/errors';
import { iso, isUniqueViolation } from '../../lib/prisma';
import { parseCredentials, type ProviderFactory } from '../../providers/registry';
import type { AffiliateProviderAdapter } from '../../providers/types';
import { authPlugin } from '../../plugins/auth';
import { auditAction } from '../../plugins/request-context';
import type { AuthService } from '../auth/auth.service';

const accountInclude = { provider: { select: { code: true, rateLimitPerSec: true, isEnabled: true } } } satisfies Prisma.AffiliateAccountInclude;
export type AccountWithProvider = Prisma.AffiliateAccountGetPayload<{ include: typeof accountInclude }>;

/**
 * SSRF guard: account endpoints may only point to the official marketplace hosts.
 * Shopee: open-api.affiliate.shopee.<tld>/graphql  ·  Lazada: api.lazada.<venture>/rest
 */
export function validateEndpoint(marketplace: Marketplace, endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequestError('endpoint must be a valid URL');
  }
  if (url.protocol !== 'https:') throw new BadRequestError('endpoint must use https');
  const ok =
    marketplace === 'SHOPEE'
      ? /^open-api\.affiliate\.shopee\.(co\.th|sg|com\.my|ph|vn|co\.id|com\.br|tw)$/.test(url.hostname) && url.pathname === '/graphql'
      : /^api\.lazada\.(co\.th|vn|sg|com\.ph|com\.my|co\.id)$/.test(url.hostname) && url.pathname.replace(/\/$/, '') === '/rest';
  if (!ok) throw new BadRequestError(`endpoint is not an official ${marketplace} API host`);
}

export class AccountRepository {
  constructor(private readonly db: PrismaClient) {}

  list() {
    return this.db.affiliateAccount.findMany({ include: accountInclude, orderBy: { createdAt: 'asc' } });
  }
  findById(id: string) {
    return this.db.affiliateAccount.findUnique({ where: { id }, include: accountInclude });
  }
  listActive() {
    return this.db.affiliateAccount.findMany({
      where: { status: 'ACTIVE', provider: { isEnabled: true } },
      include: accountInclude
    });
  }
  providerByCode(code: Marketplace) {
    return this.db.affiliateProvider.findUnique({ where: { code } });
  }
  create(data: Prisma.AffiliateAccountUncheckedCreateInput) {
    return this.db.affiliateAccount.create({ data, include: accountInclude });
  }
  update(id: string, data: Prisma.AffiliateAccountUncheckedUpdateInput) {
    return this.db.affiliateAccount.update({ where: { id }, data, include: accountInclude });
  }
  markSynced(id: string) {
    return this.db.affiliateAccount.update({ where: { id }, data: { lastSyncedAt: new Date() } });
  }
  async providers() {
    return this.db.affiliateProvider.findMany({
      include: { _count: { select: { accounts: true, products: true } } },
      orderBy: { code: 'asc' }
    });
  }
  updateProvider(id: string, data: UpdateProviderBodyT) {
    return this.db.affiliateProvider.update({
      where: { id },
      data,
      include: { _count: { select: { accounts: true, products: true } } }
    });
  }
}

function toAccountDto(a: AccountWithProvider): AccountDtoT {
  return {
    id: a.id,
    providerId: a.providerId,
    marketplace: a.provider.code,
    name: a.name,
    region: a.region,
    endpoint: a.endpoint,
    status: a.status,
    hasCredentials: a.credentialsEnc.length > 0,
    lastSyncedAt: iso(a.lastSyncedAt),
    createdAt: iso(a.createdAt)
  };
}

export class AccountService {
  constructor(
    private readonly repo: AccountRepository,
    private readonly box: SecretBox,
    private readonly factory: ProviderFactory
  ) {}

  async list(): Promise<AccountDtoT[]> {
    return (await this.repo.list()).map(toAccountDto);
  }

  async get(id: string): Promise<AccountWithProvider> {
    const a = await this.repo.findById(id);
    if (!a) throw new NotFoundError('Affiliate account');
    return a;
  }

  /** Build a provider adapter for an account (credentials are decrypted in memory only). */
  async adapterFor(account: AccountWithProvider): Promise<AffiliateProviderAdapter> {
    return this.factory.create({
      marketplace: account.provider.code,
      region: account.region,
      endpoint: account.endpoint,
      credentialsEnc: account.credentialsEnc,
      rateLimitPerSec: account.provider.rateLimitPerSec
    });
  }

  async create(body: CreateAccountBodyT): Promise<AccountDtoT> {
    validateEndpoint(body.marketplace, body.endpoint);
    const creds = parseCredentials(body.marketplace, body.credentials);
    const provider = await this.repo.providerByCode(body.marketplace);
    if (!provider) throw new NotFoundError('Provider');
    try {
      const row = await this.repo.create({
        providerId: provider.id,
        name: body.name,
        region: body.region,
        endpoint: body.endpoint,
        credentialsEnc: this.box.encryptJson(creds)
      });
      return toAccountDto(row);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('Account name already exists for this marketplace');
      throw e;
    }
  }

  async update(id: string, body: UpdateAccountBodyT): Promise<AccountDtoT> {
    const existing = await this.get(id);
    if (body.endpoint) validateEndpoint(existing.provider.code, body.endpoint);
    const data: Prisma.AffiliateAccountUncheckedUpdateInput = {
      ...(body.name ? { name: body.name } : {}),
      ...(body.endpoint ? { endpoint: body.endpoint } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.credentials
        ? { credentialsEnc: this.box.encryptJson(parseCredentials(existing.provider.code, body.credentials)) }
        : {})
    };
    return toAccountDto(await this.repo.update(id, data));
  }

  async test(id: string): Promise<{ ok: boolean; message: string }> {
    const account = await this.get(id);
    try {
      await (await this.adapterFor(account)).testConnection();
      if (account.status === 'ERROR') await this.repo.update(id, { status: 'ACTIVE' });
      return { ok: true, message: 'Connection successful' };
    } catch (e) {
      if (e instanceof ProviderError && !e.retryable) await this.repo.update(id, { status: 'ERROR' });
      return { ok: false, message: errorMessage(e) };
    }
  }

  async providers(): Promise<ProviderDtoT[]> {
    return (await this.repo.providers()).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      baseUrl: p.baseUrl,
      rateLimitPerSec: p.rateLimitPerSec,
      isEnabled: p.isEnabled,
      accountCount: p._count.accounts,
      productCount: p._count.products
    }));
  }

  async updateProvider(id: string, body: UpdateProviderBodyT): Promise<ProviderDtoT> {
    const p = await this.repo.updateProvider(id, body);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      baseUrl: p.baseUrl,
      rateLimitPerSec: p.rateLimitPerSec,
      isEnabled: p.isEnabled,
      accountCount: p._count.accounts,
      productCount: p._count.products
    };
  }
}

const security = [{ bearerAuth: [] }];
const IdParams = t.Object({ id: t.String({ format: 'uuid' }) });

export function accountController(auth: AuthService, accounts: AccountService) {
  return new Elysia({ prefix: '/api/v1' })
    .use(authPlugin(auth))
    .get('/providers', () => accounts.providers(), {
      auth: { role: 'VIEWER' },
      response: { 200: t.Array(ProviderDto) },
      detail: { tags: ['Marketplaces'], security }
    })
    .patch(
      '/providers/:id',
      async ({ params, body, request }) => {
        const p = await accounts.updateProvider(params.id, body);
        auditAction(request, 'provider.update', { providerId: params.id, ...body });
        return p;
      },
      { auth: { role: 'ADMIN' }, params: IdParams, body: UpdateProviderBody, response: { 200: ProviderDto }, detail: { tags: ['Marketplaces'], security } }
    )
    .get('/accounts', () => accounts.list(), {
      auth: { role: 'VIEWER' },
      response: { 200: t.Array(AccountDto) },
      detail: { tags: ['Affiliate Accounts'], summary: 'Credentials are never returned', security }
    })
    .post(
      '/accounts',
      async ({ body, request, set }) => {
        const a = await accounts.create(body);
        auditAction(request, 'account.create', { accountId: a.id, marketplace: a.marketplace });
        set.status = 201;
        return a;
      },
      {
        auth: { role: 'ADMIN' },
        body: CreateAccountBody,
        response: { 201: AccountDto, 400: ErrorResponse, 409: ErrorResponse },
        detail: { tags: ['Affiliate Accounts'], security }
      }
    )
    .patch(
      '/accounts/:id',
      async ({ params, body, request }) => {
        const a = await accounts.update(params.id, body);
        auditAction(request, 'account.update', { accountId: params.id, credentialsChanged: body.credentials !== undefined });
        return a;
      },
      { auth: { role: 'ADMIN' }, params: IdParams, body: UpdateAccountBody, response: { 200: AccountDto }, detail: { tags: ['Affiliate Accounts'], security } }
    )
    .post('/accounts/:id/test', ({ params }) => accounts.test(params.id), {
      auth: { role: 'ADMIN' },
      params: IdParams,
      response: { 200: t.Object({ ok: t.Boolean(), message: t.String() }) },
      detail: { tags: ['Affiliate Accounts'], summary: 'Test marketplace credentials', security }
    });
}
