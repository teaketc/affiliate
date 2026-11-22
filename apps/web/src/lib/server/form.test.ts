import { describe, expect, test } from 'bun:test';
import { CreateCampaignBody, GenerateLinkBody, SystemSettingsDto } from '@affiliate/shared';
import { localToIso, parseForm } from './form';

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe('parseForm (shared schemas)', () => {
  test('splits comma separated arrays and drops empty values', () => {
    const r = parseForm(GenerateLinkBody, fd([['accountId', '7f0c1f53-3a4b-4a51-9d7d-6c7d2b5b1a10'], ['subIds', 'fb, post1'], ['campaignId', '']]), { arrays: ['subIds'] });
    expect(r).toEqual({ ok: true, data: { accountId: '7f0c1f53-3a4b-4a51-9d7d-6c7d2b5b1a10', subIds: ['fb', 'post1'] } });
  });
  test('reports field errors', () => {
    const r = parseForm(CreateCampaignBody, fd([['accountId', 'nope'], ['name', 'x'], ['code', 'bad code!']]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(['accountId', 'code']));
  });
  test('converts numbers and booleans', () => {
    const r = parseForm(SystemSettingsDto, fd([['syncCron', '0 */6 * * *'], ['syncEnabled', 'true'], ['priceHistoryRetentionDays', '90'], ['clickRetentionDays', '30'], ['defaultSyncKeywords', 'a,b']]), { arrays: ['defaultSyncKeywords'] });
    expect(r.ok && r.data.priceHistoryRetentionDays).toBe(90);
    expect(r.ok && r.data.syncEnabled).toBe(true);
  });
  test('localToIso assumes Bangkok time', () => {
    expect(localToIso('2026-11-22T10:00')).toBe('2026-11-22T03:00:00.000Z');
    expect(localToIso('')).toBeUndefined();
  });
});
