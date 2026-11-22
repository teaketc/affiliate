import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const EnvSchema = Type.Object({
  NODE_ENV: Type.Union([Type.Literal('development'), Type.Literal('test'), Type.Literal('production')], {
    default: 'development'
  }),
  PORT: Type.Integer({ default: 3000 }),
  LOG_LEVEL: Type.Union(
    ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].map((l) => Type.Literal(l)),
    { default: 'info' }
  ),
  DATABASE_URL: Type.String({ minLength: 1 }),
  REDIS_URL: Type.String({ minLength: 1, default: 'redis://localhost:6379' }),
  JWT_SECRET: Type.String({ minLength: 32 }),
  JWT_ISSUER: Type.String({ default: 'affiliate-api' }),
  JWT_AUDIENCE: Type.String({ default: 'affiliate-admin' }),
  JWT_TTL_SECONDS: Type.Integer({ minimum: 300, default: 28_800 }),
  /** 32 random bytes, base64 encoded: `openssl rand -base64 32` */
  CREDENTIALS_ENCRYPTION_KEY: Type.String({ minLength: 44 }),
  CLICK_IP_SALT: Type.String({ minLength: 16 }),
  /** Comma separated list of allowed origins for CORS */
  CORS_ORIGINS: Type.String({ default: 'http://localhost:5173' }),
  /** Public base URL used to build /r/:code tracking links */
  PUBLIC_BASE_URL: Type.String({ default: 'http://localhost:3000' }),
  RATE_LIMIT_PER_MIN: Type.Integer({ minimum: 1, default: 300 }),
  TRUST_PROXY: Type.Boolean({ default: false }),
  PROVIDER_TIMEOUT_MS: Type.Integer({ minimum: 1000, default: 15_000 }),
  SYNC_CONCURRENCY: Type.Integer({ minimum: 1, maximum: 20, default: 2 }),
  SWAGGER_ENABLED: Type.Boolean({ default: true })
});

export type Env = Static<typeof EnvSchema>;

/** Parse + validate env. Throws with a readable list of problems. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const input: Record<string, unknown> = {};
  for (const key of Object.keys(EnvSchema.properties)) {
    const v = source[key];
    if (v !== undefined && v !== '') input[key] = v;
  }
  const withDefaults = Value.Default(EnvSchema, input);
  const converted = Value.Convert(EnvSchema, withDefaults);
  if (!Value.Check(EnvSchema, converted)) {
    const problems = [...Value.Errors(EnvSchema, converted)].map((e) => `  ${e.path || '/'}: ${e.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  const env = converted as Env;
  if (Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (openssl rand -base64 32)');
  }
  return env;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}
