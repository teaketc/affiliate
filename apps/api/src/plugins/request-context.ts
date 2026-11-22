/**
 * Per-request audit context keyed by the Request object. Lets independent plugins
 * (auth, controllers, logger) share request metadata without coupling their Elysia types.
 */
export interface AuditContext {
  requestId: string;
  startedAt: number;
  ip: string | null;
  userId?: string;
  apiKeyId?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

const contexts = new WeakMap<Request, AuditContext>();

export function initAudit(request: Request, ip: string | null): AuditContext {
  const incoming = request.headers.get('x-request-id');
  const requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  const ctx: AuditContext = { requestId, startedAt: performance.now(), ip };
  contexts.set(request, ctx);
  return ctx;
}

export function audit(request: Request): AuditContext {
  let ctx = contexts.get(request);
  if (!ctx) {
    ctx = { requestId: crypto.randomUUID(), startedAt: performance.now(), ip: null };
    contexts.set(request, ctx);
  }
  return ctx;
}

/** Mark the current request with an audit action (persisted to api_logs). */
export function auditAction(request: Request, action: string, metadata?: Record<string, unknown>): void {
  const ctx = audit(request);
  ctx.action = action;
  if (metadata) ctx.metadata = { ...ctx.metadata, ...metadata };
}

export function clientIp(
  request: Request,
  server: { requestIP(req: Request): { address: string } | null } | null,
  trustProxy: boolean
): string | null {
  if (trustProxy) {
    const fwd = request.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0]?.trim() ?? null;
    const real = request.headers.get('x-real-ip');
    if (real) return real;
  }
  return server?.requestIP(request)?.address ?? null;
}
