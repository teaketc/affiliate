import { describe, expect, test } from 'bun:test';
import { createHash, createHmac } from 'node:crypto';
import { lazadaSign } from '../../src/providers/lazada/signer';
import { shopeeAuthHeader, shopeeSignature } from '../../src/providers/shopee/signer';

describe('lazadaSign (official algorithm)', () => {
  test('sorts params by ASCII name, prefixes API path, HMAC-SHA256, uppercase hex', () => {
    // doc example: foo=1, bar=2, foo_bar=3, foobar=4 -> "/test/apibar2foo1foo_bar3foobar4"
    const params = { foo: '1', bar: '2', foo_bar: '3', foobar: '4' };
    const expected = createHmac('sha256', 'secret').update('/test/apibar2foo1foo_bar3foobar4').digest('hex').toUpperCase();
    expect(lazadaSign('/test/api', params, 'secret')).toBe(expected);
  });

  test('excludes "sign" and empty values', () => {
    const a = lazadaSign('/x', { a: '1', sign: 'ZZZ', b: '' }, 's');
    const b = lazadaSign('/x', { a: '1' }, 's');
    expect(a).toBe(b);
  });

  test('result is 64 uppercase hex chars', () => {
    expect(lazadaSign('/x', { a: '1' }, 's')).toMatch(/^[0-9A-F]{64}$/);
  });
});

describe('shopee signature', () => {
  test('sha256(appId + timestamp + payload + secret) lowercase hex', () => {
    const payload = '{"query":"{ x }"}';
    const expected = createHash('sha256').update(`123${1700000000}${payload}sec`).digest('hex');
    expect(shopeeSignature('123', 1700000000, payload, 'sec')).toBe(expected);
  });

  test('authorization header format', () => {
    const h = shopeeAuthHeader('123', 1700000000, '{}', 'sec');
    expect(h).toMatch(/^SHA256 Credential=123, Timestamp=1700000000, Signature=[0-9a-f]{64}$/);
  });
});
