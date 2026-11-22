import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { User } from '@prisma/client';
import {
  API_SCOPES,
  roleAtLeast,
  type ApiScope,
  type CreateUserBody,
  type LoginResponse,
  type UserDto,
  type UserRole
} from '@affiliate/shared';
import { sha256Hex } from '../../lib/crypto';
import { ConflictError, ForbiddenError, NotFoundError, TooManyRequestsError, UnauthorizedError } from '../../lib/errors';
import { iso, isUniqueViolation } from '../../lib/prisma';
import type { RateLimiter } from '../../lib/rate-limiter';
import type { ApiKeyRepository } from '../api-keys/api-key.repository';
import type { AuthRequirement, Principal } from './principal';
import type { UserRepository } from './user.repository';

export interface AuthConfig {
  jwtSecret: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export const bunPasswordHasher: PasswordHasher = {
  hash: (p) => Bun.password.hash(p, { algorithm: 'argon2id' }),
  verify: (p, h) => Bun.password.verify(p, h)
};

const isScope = (s: string): s is ApiScope => (API_SCOPES as readonly string[]).includes(s);

export function toUserDto(u: User): UserDto {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: iso(u.createdAt)
  };
}

export class AuthService {
  private readonly key: Uint8Array;
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly users: UserRepository,
    private readonly apiKeys: ApiKeyRepository,
    private readonly limiter: RateLimiter,
    private readonly cfg: AuthConfig,
    private readonly hasher: PasswordHasher = bunPasswordHasher
  ) {
    this.key = new TextEncoder().encode(cfg.jwtSecret);
  }

  async login(email: string, password: string, ip: string | null): Promise<LoginResponse> {
    // brute-force protection: 10 attempts / 15 min per email+ip
    const rl = await this.limiter.hit(`login:${email.toLowerCase()}:${ip ?? '-'}`, 10, 900);
    if (!rl.allowed) throw new TooManyRequestsError(rl.resetSec);

    const user = await this.users.findByEmail(email);
    // constant-ish work even when the user does not exist
    this.dummyHash ??= this.hasher.hash('timing-equaliser-password');
    const ok = user
      ? await this.hasher.verify(password, user.passwordHash)
      : await this.hasher.verify(password, await this.dummyHash).then(() => false);
    if (!user || !ok || !user.isActive) throw new UnauthorizedError('Invalid email or password');

    const updated = await this.users.touchLogin(user.id);
    const accessToken = await new SignJWT({ role: user.role, email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(this.cfg.issuer)
      .setAudience(this.cfg.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.cfg.ttlSeconds}s`)
      .sign(this.key);
    return { accessToken, expiresIn: this.cfg.ttlSeconds, user: toUserDto(updated) };
  }

  async verifyJwt(token: string): Promise<Principal> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.cfg.issuer,
        audience: this.cfg.audience,
        algorithms: ['HS256']
      });
      if (!payload.sub) throw new UnauthorizedError('Invalid token');
      // re-read the user so disabled accounts and role changes apply immediately
      const user = await this.users.findById(payload.sub);
      if (!user || !user.isActive) throw new UnauthorizedError('Account disabled');
      return { kind: 'user', userId: user.id, email: user.email, role: user.role };
    } catch (e) {
      if (e instanceof UnauthorizedError) throw e;
      if (e instanceof joseErrors.JWTExpired) throw new UnauthorizedError('Token expired');
      throw new UnauthorizedError('Invalid token');
    }
  }

  async verifyApiKey(key: string): Promise<Principal> {
    if (!key.startsWith('ak_live_') || key.length > 200) throw new UnauthorizedError('Invalid API key');
    const row = await this.apiKeys.findByHash(sha256Hex(key));
    if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) {
      throw new UnauthorizedError('Invalid API key');
    }
    const rl = await this.limiter.hit(`apikey:${row.id}`, row.rateLimitPerMin, 60);
    if (!rl.allowed) throw new TooManyRequestsError(rl.resetSec);
    void this.apiKeys.touch(row.id).catch(() => undefined);
    return {
      kind: 'apiKey',
      apiKeyId: row.id,
      userId: row.userId,
      scopes: row.scopes.filter(isScope),
      rateLimitPerMin: row.rateLimitPerMin
    };
  }

  /** Resolve credentials from headers and enforce the endpoint requirement (RBAC). */
  async authorize(headers: { authorization?: string | undefined; apiKey?: string | undefined }, req: AuthRequirement): Promise<Principal> {
    let principal: Principal;
    if (headers.authorization?.startsWith('Bearer ')) {
      principal = await this.verifyJwt(headers.authorization.slice(7).trim());
    } else if (headers.apiKey) {
      principal = await this.verifyApiKey(headers.apiKey.trim());
    } else {
      throw new UnauthorizedError();
    }
    assertAllowed(principal, req);
    return principal;
  }

  listUsers(): Promise<UserDto[]> {
    return this.users.list().then((l) => l.map(toUserDto));
  }

  async createUser(body: CreateUserBody): Promise<UserDto> {
    try {
      const user = await this.users.create({
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: await this.hasher.hash(body.password)
      });
      return toUserDto(user);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('Email already registered');
      throw e;
    }
  }

  async updateUser(actor: Principal, id: string, data: { role?: UserRole; isActive?: boolean }): Promise<UserDto> {
    if (actor.kind === 'user' && actor.userId === id && (data.role !== undefined || data.isActive === false)) {
      throw new ForbiddenError('You cannot change your own role or disable yourself');
    }
    const existing = await this.users.findById(id);
    if (!existing) throw new NotFoundError('User');
    return toUserDto(await this.users.update(id, data));
  }

  async me(principal: Principal): Promise<UserDto> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new NotFoundError('User');
    return toUserDto(user);
  }
}

export function assertAllowed(p: Principal, req: AuthRequirement): void {
  if (p.kind === 'user') {
    if (!roleAtLeast(p.role, req.role)) throw new ForbiddenError();
    return;
  }
  if (!req.scope) throw new ForbiddenError('This endpoint requires an admin session');
  if (!p.scopes.includes(req.scope)) throw new ForbiddenError(`API key lacks scope ${req.scope}`);
}
