import { fail } from '@sveltejs/kit';
import { Value } from '@sinclair/typebox/value';
import { SyncProductsBody, SyncStatusSchema, type AccountDto, type PaginatedResult, type SyncJobDto } from '@affiliate/shared';
import { api, failure, load as get } from '$lib/server/api';
import { parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const sp = event.url.searchParams;
  const status = sp.get('status');
  const [jobs, accounts, queue] = await Promise.all([
    get<PaginatedResult<SyncJobDto>>(event, '/api/v1/sync/jobs', {
      page: Number(sp.get('page') ?? 1) || 1,
      status: status && Value.Check(SyncStatusSchema, status) ? status : undefined
    }),
    get<AccountDto[]>(event, '/api/v1/accounts'),
    get<Record<string, number>>(event, '/api/v1/sync/queue')
  ]);
  return { jobs, accounts, queue, status: status ?? '' };
};

const jobAction = (verb: 'retry' | 'cancel') => async (event: Parameters<Actions[string]>[0]) => {
  const form = await event.request.formData();
  try {
    await api(event, `/api/v1/sync/jobs/${encodeURIComponent(String(form.get('id')))}/${verb}`, { method: 'POST' });
    return { success: verb === 'retry' ? 'สั่งซิงค์ใหม่แล้ว' : 'ยกเลิกแล้ว' };
  } catch (e) {
    return fail(400, failure(e));
  }
};

export const actions: Actions = {
  trigger: async (event) => {
    const form = await event.request.formData();
    const parsed = parseForm(SyncProductsBody, form);
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลไม่ถูกต้อง', errors: parsed.errors });
    try {
      await api(event, '/api/v1/sync/products', { method: 'POST', body: parsed.data });
      return { success: 'เพิ่มงานเข้าคิวแล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  },
  retry: jobAction('retry'),
  cancel: jobAction('cancel')
};
