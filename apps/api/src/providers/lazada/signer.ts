import { createHmac } from 'node:crypto';

/**
 * Lazada Open Platform signature (official doc "Signature algorithm"):
 *  1. sort all request params (system + business, excluding `sign`) by name in ASCII order
 *  2. concatenate key + value for each param
 *  3. prefix with the API path, e.g. "/marketing/product/feed"
 *  4. HMAC-SHA256 with the app secret, UTF-8
 *  5. uppercase hex
 * Empty values are skipped, matching the official SDK (`areNotEmpty(key, value)`).
 */
export function lazadaSign(apiPath: string, params: Record<string, string>, appSecret: string): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== '')
    .sort();
  let base = apiPath;
  for (const k of keys) base += `${k}${params[k]}`;
  return createHmac('sha256', appSecret).update(base, 'utf8').digest('hex').toUpperCase();
}
