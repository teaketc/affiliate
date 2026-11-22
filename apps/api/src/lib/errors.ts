/** Application error hierarchy. Every error carries an HTTP status and a stable machine code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message);
  }
}
export class NotFoundError extends AppError {
  constructor(entity: string) {
    super(404, 'NOT_FOUND', `${entity} not found`);
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}
export class TooManyRequestsError extends AppError {
  constructor(public readonly retryAfterSec: number) {
    super(429, 'RATE_LIMITED', 'Too many requests');
  }
}

/** Errors raised while talking to a marketplace. `retryable` drives BullMQ retry behaviour. */
export class ProviderError extends AppError {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly retryable: boolean,
    public readonly providerCode?: string
  ) {
    super(502, 'PROVIDER_ERROR', `[${provider}] ${message}`, providerCode ? { providerCode } : undefined);
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
