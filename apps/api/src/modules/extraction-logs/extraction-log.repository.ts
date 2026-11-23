import type { ErrorCode, ExtractionStatus, Marketplace } from '@affiliate/shared';
import type { ExtractionLog, Prisma, PrismaClient, Product } from '@prisma/client';

export interface CreateLogInput {
	affiliateUrl: string;
	marketplace: Marketplace | null;
	productId: string | null;
	status: ExtractionStatus;
	errorCode: ErrorCode | null;
	errorMessage: string | null;
	extractedData: Prisma.InputJsonValue | null;
}

export interface LogListQuery {
	skip: number;
	take: number;
	status?: ExtractionStatus;
	marketplace?: Marketplace;
	search?: string;
	productId?: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

export class ExtractionLogRepository {
	constructor(private readonly prisma: PrismaClient) {}

	create(input: CreateLogInput, db: Db = this.prisma): Promise<ExtractionLog> {
		return db.extractionLog.create({
			data: {
				affiliateUrl: input.affiliateUrl,
				marketplace: input.marketplace,
				productId: input.productId,
				status: input.status,
				errorCode: input.errorCode,
				errorMessage: input.errorMessage,
				extractedData: input.extractedData ?? undefined
			}
		});
	}

	async list(q: LogListQuery): Promise<{ items: ExtractionLog[]; total: number }> {
		const where: Prisma.ExtractionLogWhereInput = {};
		if (q.status) where.status = q.status;
		if (q.marketplace) where.marketplace = q.marketplace;
		if (q.productId) where.productId = q.productId;
		if (q.search) where.affiliateUrl = { contains: q.search, mode: 'insensitive' };
		const [items, total] = await this.prisma.$transaction([
			this.prisma.extractionLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: q.skip, take: q.take }),
			this.prisma.extractionLog.count({ where })
		]);
		return { items, total };
	}

	findById(id: string): Promise<(ExtractionLog & { product: Product | null }) | null> {
		return this.prisma.extractionLog.findUnique({ where: { id }, include: { product: true } });
	}
}
