import { fail } from '@sveltejs/kit';
import { UpdateProviderBody, type ProviderDto } from '@affiliate/shared';
import { api, failure, load as get } from '$lib/server/api';
import { parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({ providers: await get<ProviderDto[]>(event, '/api/v1/providers') });

export const actions: Actions = {
  update: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    form.delete('id');
    form.set('isEnabled', form.get('isEnabled') === 'on' ? 'true' : 'false');
    const parsed = parseForm(UpdateProviderBody, form);
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลไม่ถูกต้อง', errors: parsed.errors });
    try {
      await api(event, `/api/v1/providers/${encodeURIComponent(id)}`, { method: 'PATCH', body: parsed.data });
      return { success: 'บันทึกแล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  }
};
