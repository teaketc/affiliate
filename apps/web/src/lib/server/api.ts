import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import type { ErrorResponse } from '@affiliate/shared';

/**
 * Server-only API client. The admin JWT lives in an httpOnly cookie and is attached here,
 * so neither the token nor the API origin is ever exposed to browser JavaScript.
 */
export const SESSION_COOKIE = 'aff_session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

function apiBase(): string {
  return (env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function isErrorResponse(v: unknown): v is ErrorResponse {
  return typeof v === 'object' && v !== null && 'error' in v && typeof (v as ErrorResponse).error?.message === 'string';
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(params: Query): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(
  event: Pick<RequestEvent, 'fetch' | 'locals' | 'getClientAddress' | 'request'>,
  path: string,
  init: { method?: string; body?: unknown; query?: Query; token?: string | null } = {}
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = init.token === undefined ? event.locals.token : init.token;
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const reqId = event.request.headers.get('x-request-id');
  if (reqId) headers['x-request-id'] = reqId;

  let res: Response;
  try {
    res = await event.fetch(`${apiBase()}${path}${init.query ? qs(init.query) : ''}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
  } catch {
    throw new ApiError(503, 'API_UNAVAILABLE', 'ไม่สามารถเชื่อมต่อ API ได้');
  }
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (isErrorResponse(json)) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
    throw new ApiError(res.status, 'HTTP_ERROR', `HTTP ${res.status}`);
  }
  return json as T;
}

/** For load functions: turn API errors into SvelteKit error pages. */
export async function load<T>(event: Parameters<typeof api>[0], path: string, query?: Query): Promise<T> {
  try {
    return await api<T>(event, path, { query });
  } catch (e) {
    if (e instanceof ApiError) error(e.status, { message: e.message, code: e.code });
    throw e;
  }
}

/** For form actions: return a serialisable failure payload. */
export function failure(e: unknown): { message: string; details?: unknown } {
  if (e instanceof ApiError) return { message: e.message, details: e.details };
  return { message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด' };
}
