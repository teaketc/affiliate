import { createHash } from 'node:crypto';

/**
 * Shopee Affiliate Open API request signature.
 *
 *   Signature = SHA256(AppId + Timestamp + Payload + Secret)   (lowercase hex)
 *   Authorization: SHA256 Credential={AppId}, Timestamp={Timestamp}, Signature={Signature}
 *
 * `payload` MUST be the exact JSON string sent as the request body.
 */
export function shopeeSignature(appId: string, timestamp: number, payload: string, secret: string): string {
  return createHash('sha256').update(`${appId}${timestamp}${payload}${secret}`, 'utf8').digest('hex');
}

export function shopeeAuthHeader(appId: string, timestamp: number, payload: string, secret: string): string {
  const sig = shopeeSignature(appId, timestamp, payload, secret);
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${sig}`;
}
