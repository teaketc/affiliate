import type { ApiKey, PrismaClient } from '@prisma/client';

export class ApiKeyRepository {
  constructor(private readonly db: PrismaClient) {}

  findByHash(keyHash: string): Promise<ApiKey | null> {
    return this.db.apiKey.findUnique({ where: { keyHash } });
  }

  listByUser(userId: string): Promise<ApiKey[]> {
    return this.db.apiKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  listAll(): Promise<ApiKey[]> {
    return this.db.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(data: {
    userId: string;
    name: string;
    prefix: string;
    keyHash: string;
    scopes: string[];
    rateLimitPerMin: number;
    expiresAt: Date | null;
  }): Promise<ApiKey> {
    return this.db.apiKey.create({ data });
  }

  revoke(id: string): Promise<ApiKey> {
    return this.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  findById(id: string): Promise<ApiKey | null> {
    return this.db.apiKey.findUnique({ where: { id } });
  }

  async touch(id: string): Promise<void> {
    await this.db.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }
}
