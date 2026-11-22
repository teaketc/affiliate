import { error, fail } from '@sveltejs/kit';
import { CreateApiKeyBody, roleAtLeast, type ApiKeyDto, type CreatedApiKeyDto } from '@affiliate/shared';
import { api, failure, load as get } from '$lib/server/api';
import { localToIso, parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user || !roleAtLeast(event.locals.user.role, 'ADMIN')) error(403, { message: 'ต้องเป็น ADMIN ขึ้นไป' });
  return { keys: await get<ApiKeyDto[]>(event, '/api/v1/api-keys') };
};

export const actions: Actions = {
  create: async (event) => {
    const form = await event.request.formData();
    const exp = localToIso(form.get('expiresAt'));
    if (exp) form.set('expiresAt', exp);
    else form.delete('expiresAt');
    const parsed = parseForm(CreateApiKeyBody, form, { arrays: ['scopes'] });
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลไม่ถูกต้อง', errors: parsed.errors });
    try {
      const created = await api<CreatedApiKeyDto>(event, '/api/v1/api-keys', { method: 'POST', body: parsed.data });
      // plaintext key is shown exactly once
      return { created: { name: created.name, key: created.key } };
    } catch (e) {
      return fail(400, failure(e));
    }
  },
  revoke: async (event) => {
    const form = await event.request.formData();
    try {
      await api(event, `/api/v1/api-keys/${encodeURIComponent(String(form.get('id')))}`, { method: 'DELETE' });
      return { success: 'เพิกถอนแล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  }
};
