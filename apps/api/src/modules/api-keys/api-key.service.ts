import type { ApiKey } from '@prisma/client';
import { API_SCOPES, roleAtLeast, type ApiKeyDto, type ApiScope, type CreateApiKeyBody, type CreatedApiKeyDto } from '@affiliate/shared';
import { generateApiKey } from '../../lib/crypto';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { iso } from '../../lib/prisma';
import type { Principal } from '../auth/principal';
import type { ApiKeyRepository } from './api-key.repository';

const isScope = (s: string): s is ApiScope => (API_SCOPES as readonly string[]).includes(s);

export function toApiKeyDto(k: ApiKey): ApiKeyDto {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes.filter(isScope),
    rateLimitPerMin: k.rateLimitPerMin,
    lastUsedAt: iso(k.lastUsedAt),
    expiresAt: iso(k.expiresAt),
    revokedAt: iso(k.revokedAt),
    createdAt: iso(k.createdAt)
  };
}

export class ApiKeyService {
  constructor(private readonly repo: ApiKeyRepository) {}

  async list(actor: Principal): Promise<ApiKeyDto[]> {
    const rows =
      actor.kind === 'user' && roleAtLeast(actor.role, 'SUPER_ADMIN')
        ? await this.repo.listAll()
        : await this.repo.listByUser(actor.userId);
    return rows.map(toApiKeyDto);
  }

  /** The plaintext key is returned exactly once; only its SHA-256 is stored. */
  async create(actor: Principal, body: CreateApiKeyBody): Promise<CreatedApiKeyDto> {
    const { key, prefix, hash } = generateApiKey();
    const row = await this.repo.create({
      userId: actor.userId,
      name: body.name,
      prefix,
      keyHash: hash,
      scopes: body.scopes,
      rateLimitPerMin: body.rateLimitPerMin ?? 120,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
    });
    return { ...toApiKeyDto(row), key };
  }

  async revoke(actor: Principal, id: string): Promise<ApiKeyDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError('API key');
    const isOwner = row.userId === actor.userId;
    const isSuper = actor.kind === 'user' && roleAtLeast(actor.role, 'SUPER_ADMIN');
    if (!isOwner && !isSuper) throw new ForbiddenError();
    return toApiKeyDto(await this.repo.revoke(id));
  }
}
