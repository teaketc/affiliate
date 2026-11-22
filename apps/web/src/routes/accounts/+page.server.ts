import { fail } from '@sveltejs/kit';
import { AccountStatusSchema, CreateAccountBody, type AccountDto } from '@affiliate/shared';
import { Value } from '@sinclair/typebox/value';
import { api, failure, load as get } from '$lib/server/api';
import { parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({ accounts: await get<AccountDto[]>(event, '/api/v1/accounts') });

/** Credentials are posted to the SvelteKit server action and forwarded to the API — never stored client-side. */
function credentialsFrom(form: FormData): Record<string, string> {
  const marketplace = form.get('marketplace');
  const pick = (k: string) => String(form.get(k) ?? '').trim();
  return marketplace === 'SHOPEE'
    ? { appId: pick('appId'), secret: pick('secret') }
    : { appKey: pick('appKey'), appSecret: pick('appSecret'), userToken: pick('userToken') };
}

export const actions: Actions = {
  create: async (event) => {
    const form = await event.request.formData();
    const creds = credentialsFrom(form);
    for (const k of ['appId', 'secret', 'appKey', 'appSecret', 'userToken']) form.delete(k);
    form.set('credentials', JSON.stringify(creds));
    const parsed = parseForm(CreateAccountBody, form, { json: ['credentials'] });
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลไม่ครบ', errors: parsed.errors });
    try {
      await api(event, '/api/v1/accounts', { method: 'POST', body: parsed.data });
      return { success: 'เพิ่มบัญชีแล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  },
  status: async (event) => {
    const form = await event.request.formData();
    const status = String(form.get('status'));
    if (!Value.Check(AccountStatusSchema, status)) return fail(400, { message: 'สถานะไม่ถูกต้อง' });
    try {
      await api(event, `/api/v1/accounts/${encodeURIComponent(String(form.get('id')))}`, { method: 'PATCH', body: { status } });
      return { success: 'อัปเดตสถานะแล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  },
  test: async (event) => {
    const form = await event.request.formData();
    try {
      const r = await api<{ ok: boolean; message: string }>(event, `/api/v1/accounts/${encodeURIComponent(String(form.get('id')))}/test`, { method: 'POST' });
      return r.ok ? { success: r.message } : fail(400, { message: r.message });
    } catch (e) {
      return fail(400, failure(e));
    }
  }
};
