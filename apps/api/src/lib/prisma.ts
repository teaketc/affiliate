import { PrismaClient, Prisma } from '@prisma/client';
import type { Logger } from './logger';

export { Prisma, PrismaClient };

export function createPrisma(log: Logger, databaseUrl: string): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: databaseUrl,
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' }
    ]
  });
  client.$on('warn', (e) => log.warn({ target: e.target }, e.message));
  client.$on('error', (e) => log.error({ target: e.target }, e.message));
  return client;
}

/** Decimal -> fixed string (NUMERIC never goes through float on the way out). */
export function dec(v: Prisma.Decimal, digits: number): string;
export function dec(v: Prisma.Decimal | null, digits: number): string | null;
export function dec(v: Prisma.Decimal | null, digits: number): string | null {
  return v === null ? null : v.toFixed(digits);
}

export function iso(d: Date): string;
export function iso(d: Date | null): string | null;
export function iso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export function isNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
}
