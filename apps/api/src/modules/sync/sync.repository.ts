import { Prisma, type PrismaClient, type SyncStatus, type SyncTrigger, type SyncType } from '@prisma/client';

export const syncInclude = {
  account: { select: { name: true, provider: { select: { code: true } } } }
} satisfies Prisma.SyncJobInclude;
export type SyncJobRow = Prisma.SyncJobGetPayload<{ include: typeof syncInclude }>;

export interface SyncJobPatch {
  status?: SyncStatus;
  queueJobId?: string;
  stats?: Record<string, unknown>;
  attempts?: number;
  error?: string | null;
  startedAt?: Date;
  finishedAt?: Date | null;
}

export interface SyncJobRepositoryPort {
  findById(id: string): Promise<SyncJobRow | null>;
  update(id: string, patch: SyncJobPatch): Promise<void>;
}

export class SyncJobRepository implements SyncJobRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  create(data: { accountId: string; type: SyncType; trigger: SyncTrigger; params: Record<string, unknown> }) {
    return this.db.syncJob.create({
      data: { ...data, params: data.params as Prisma.InputJsonObject },
      include: syncInclude
    });
  }

  findById(id: string) {
    return this.db.syncJob.findUnique({ where: { id }, include: syncInclude });
  }

  async update(id: string, patch: SyncJobPatch): Promise<void> {
    const { stats, ...rest } = patch;
    await this.db.syncJob.update({
      where: { id },
      data: { ...rest, ...(stats ? { stats: stats as Prisma.InputJsonObject } : {}) }
    });
  }

  async list(where: Prisma.SyncJobWhereInput, skip: number, take: number) {
    const [rows, total] = await this.db.$transaction([
      this.db.syncJob.findMany({ where, include: syncInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      this.db.syncJob.count({ where })
    ]);
    return { rows, total };
  }

  /** Is there already a queued/running job for this account+type? (prevents duplicate manual syncs) */
  hasInFlight(accountId: string, type: SyncType) {
    return this.db.syncJob
      .count({ where: { accountId, type, status: { in: ['QUEUED', 'RUNNING'] } } })
      .then((c) => c > 0);
  }

  /** Jobs stuck in RUNNING after a worker crash. */
  markStale(olderThan: Date) {
    return this.db.syncJob.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: olderThan } },
      data: { status: 'FAILED', error: 'Worker lost (stale RUNNING job)', finishedAt: new Date() }
    });
  }
}
