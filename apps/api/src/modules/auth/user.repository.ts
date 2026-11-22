import type { PrismaClient, User, UserRole } from '@prisma/client';

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  list(): Promise<User[]> {
    return this.db.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  create(data: { email: string; name: string; passwordHash: string; role: UserRole }): Promise<User> {
    return this.db.user.create({ data: { ...data, email: data.email.toLowerCase() } });
  }

  update(id: string, data: { role?: UserRole; isActive?: boolean; name?: string }): Promise<User> {
    return this.db.user.update({ where: { id }, data });
  }

  touchLogin(id: string): Promise<User> {
    return this.db.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }
}
