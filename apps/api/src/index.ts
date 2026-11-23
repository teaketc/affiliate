import { createApp } from './app';
import { loadConfig } from './config/env';
import { createPrisma } from './db/prisma';
import { SafeHttpClient, type HttpClient } from './extractors/http/http-client';
import { MockHttpClient } from './extractors/http/mock-http-client';
import { createDefaultRegistry } from './extractors/registry';
import { createLogger } from './lib/logger';
import { MemoryRateLimiter } from './security/rate-limit';

const config = loadConfig();
const logger = createLogger(config.logLevel, { service: 'affiliate-api' });
const prisma = createPrisma(config.databaseUrl);

const http: HttpClient = config.extractorMode === 'mock' ? new MockHttpClient() : new SafeHttpClient(config.fetch);
if (config.extractorMode === 'mock') {
	logger.warn('extractor.mock_mode', { msg: 'EXTRACTOR_MODE=mock: no marketplace requests are made; products are labelled [MOCK]' });
}

const app = createApp({
	config,
	prisma,
	registry: createDefaultRegistry(http),
	rateLimiter: new MemoryRateLimiter(config.rateLimit.max, config.rateLimit.windowMs),
	logger
}).listen({ port: config.port, hostname: config.host });

logger.info('server.started', { url: `http://${config.host}:${config.port}`, swagger: '/swagger', mode: config.extractorMode });

const shutdown = async (signal: string) => {
	logger.info('server.shutdown', { signal });
	await app.stop();
	await prisma.$disconnect();
	process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
