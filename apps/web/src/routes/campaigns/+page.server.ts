import { fail } from '@sveltejs/kit';
import { Value } from '@sinclair/typebox/value';
import { CampaignStatusSchema, CreateCampaignBody, type AccountDto, type CampaignDto, type PaginatedResult } from '@affiliate/shared';
import { api, failure, load as get } from '$lib/server/api';
import { localToIso, parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const page = Number(event.url.searchParams.get('page') ?? 1) || 1;
  const [campaigns, accounts] = await Promise.all([
    get<PaginatedResult<CampaignDto>>(event, '/api/v1/campaigns', { page }),
    get<AccountDto[]>(event, '/api/v1/accounts')
  ]);
  return { campaigns, accounts };
};

export const actions: Actions = {
  create: async (event) => {
    const form = await event.request.formData();
    for (const k of ['startsAt', 'endsAt']) {
      const iso = localToIso(form.get(k));
      if (iso) form.set(k, iso);
      else form.delete(k);
    }
    const parsed = parseForm(CreateCampaignBody, form);
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลไม่ถูกต้อง', errors: parsed.errors });
    try {
      await api(event, '/api/v1/campaigns', { method: 'POST', body: parsed.data });
      return { success: 'สร้างแคมเปญแล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  },
  status: async (event) => {
    const form = await event.request.formData();
    const status = String(form.get('status'));
    if (!Value.Check(CampaignStatusSchema, status)) return fail(400, { message: 'สถานะไม่ถูกต้อง' });
    try {
      await api(event, `/api/v1/campaigns/${encodeURIComponent(String(form.get('id')))}`, { method: 'PATCH', body: { status } });
      return { success: 'อัปเดตแล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  }
};
