import { describe, expect, test } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { GenerateLinkBody, ProductListQuery, formatMoney, formatRate, percentToRate, roleAtLeast, totalPages } from '../src';

describe('format helpers', () => {
  test('formatRate', () => {
    expect(formatRate('0.2500')).toBe('25%');
    expect(formatRate('0.1234', 1)).toBe('12.3%');
    expect(formatRate(null)).toBe('—');
  });
  test('formatMoney', () => {
    expect(formatMoney('1299.5', 'THB', 'en-US').replace(/\s/g, ' ')).toBe('THB 1,299.50');
    expect(formatMoney(null)).toBe('—');
  });
  test('percentToRate / totalPages', () => {
    expect(percentToRate(12.5)).toBe(0.125);
    expect(totalPages(41, 20)).toBe(3);
  });
  test('roleAtLeast', () => {
    expect(roleAtLeast('ADMIN', 'EDITOR')).toBe(true);
    expect(roleAtLeast('VIEWER', 'EDITOR')).toBe(false);
  });
});

describe('schemas', () => {
  test('GenerateLinkBody rejects unsafe sub ids', () => {
    const ok = { accountId: '7f0c1f53-3a4b-4a51-9d7d-6c7d2b5b1a10', subIds: ['camp_1'] };
    expect(Value.Check(GenerateLinkBody, ok)).toBe(true);
    expect(Value.Check(GenerateLinkBody, { ...ok, subIds: ['<script>'] })).toBe(false);
  });
  test('ProductListQuery bounds', () => {
    expect(Value.Check(ProductListQuery, { limit: 100, sort: 'price_asc' })).toBe(true);
    expect(Value.Check(ProductListQuery, { limit: 101 })).toBe(false);
    expect(Value.Check(ProductListQuery, { sort: 'random' })).toBe(false);
  });
});
