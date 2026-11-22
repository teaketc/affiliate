import { fail } from '@sveltejs/kit';
import { GenerateLinkBody, type AccountDto, type AffiliateLinkDto, type CampaignDto, type PaginatedResult } from '@affiliate/shared';
import { api, failure, load as get } from '$lib/server/api';
import { parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const sp = event.url.searchParams;
  const [links, accounts, campaigns] = await Promise.all([
    get<PaginatedResult<AffiliateLinkDto>>(event, '/api/v1/affiliate/links', {
      page: Number(sp.get('page') ?? 1) || 1,
      accountId: sp.get('accountId') ?? undefined,
      campaignId: sp.get('campaignId') ?? undefined
    }),
    get<AccountDto[]>(event, '/api/v1/accounts'),
    get<PaginatedResult<CampaignDto>>(event, '/api/v1/campaigns', { limit: 100 })
  ]);
  return { links, accounts, campaigns: campaigns.data, filter: { accountId: sp.get('accountId') ?? '', campaignId: sp.get('campaignId') ?? '' } };
};

export const actions: Actions = {
  generate: async (event) => {
    const form = await event.request.formData();
    const parsed = parseForm(GenerateLinkBody, form, { arrays: ['subIds'] });
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลไม่ถูกต้อง', errors: parsed.errors });
    try {
      const link = await api<AffiliateLinkDto>(event, '/api/v1/affiliate/generate-link', { method: 'POST', body: parsed.data });
      return { success: `สร้างลิงก์แล้ว: ${link.trackingUrl}` };
    } catch (e) {
      return fail(400, failure(e));
    }
  }
};
