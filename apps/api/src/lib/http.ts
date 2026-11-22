export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** fetch with an AbortSignal timeout; network failures surface as `TypeError`/`TimeoutError`. */
export async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  return fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
