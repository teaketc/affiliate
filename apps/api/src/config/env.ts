export type ExtractorMode = 'live' | 'mock';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
	nodeEnv: string;
	port: number;
	host: string;
	databaseUrl: string;
	corsOrigins: string[];
	extractorMode: ExtractorMode;
	logLevel: LogLevel;
	trustProxy: boolean;
	rateLimit: { max: number; windowMs: number };
	fetch: {
		timeoutMs: number;
		maxRedirects: number;
		maxResponseBytes: number;
	};
}

function readInt(name: string, fallback: number, min: number, max: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return fallback;
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value < min || value > max) {
		throw new Error(`Environment variable ${name} must be an integer between ${min} and ${max}`);
	}
	return value;
}

function readEnum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return fallback;
	const match = allowed.find((v) => v === raw);
	if (!match) throw new Error(`Environment variable ${name} must be one of: ${allowed.join(', ')}`);
	return match;
}

export function loadConfig(): AppConfig {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is required');

	return {
		nodeEnv: process.env.NODE_ENV ?? 'development',
		port: readInt('PORT', 3000, 1, 65535),
		host: process.env.HOST ?? '0.0.0.0',
		databaseUrl,
		corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		extractorMode: readEnum('EXTRACTOR_MODE', ['live', 'mock'] as const, 'live'),
		logLevel: readEnum('LOG_LEVEL', ['debug', 'info', 'warn', 'error'] as const, 'info'),
		trustProxy: process.env.TRUST_PROXY === 'true',
		rateLimit: {
			max: readInt('RATE_LIMIT_MAX', 10, 1, 10_000),
			windowMs: readInt('RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000)
		},
		fetch: {
			timeoutMs: readInt('FETCH_TIMEOUT_MS', 10_000, 1_000, 60_000),
			maxRedirects: readInt('FETCH_MAX_REDIRECTS', 5, 0, 10),
			maxResponseBytes: readInt('FETCH_MAX_RESPONSE_BYTES', 3_000_000, 10_000, 20_000_000)
		}
	};
}
