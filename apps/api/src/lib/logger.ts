import pino, { type Logger } from 'pino';

export type { Logger };

/**
 * Structured JSON logger. Secrets are redacted by path so that accidental logging of
 * request headers or provider credentials does not leak them.
 */
export function createLogger(level: string, name = 'api'): Logger {
  return pino({
    name,
    level,
    base: { service: `affiliate-${name}` },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: [
        'headers.authorization',
        'headers["x-api-key"]',
        'headers.cookie',
        '*.password',
        '*.secret',
        '*.appSecret',
        '*.userToken',
        '*.credentials',
        'credentials'
      ],
      censor: '[REDACTED]'
    }
  });
}
