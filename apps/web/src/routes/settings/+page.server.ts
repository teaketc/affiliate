import { fail } from '@sveltejs/kit';
import {
  CreateUserBody,
  SystemSettingsDto,
  roleAtLeast,
  type AuditLogDto,
  type PaginatedResult,
  type SystemSettingsDto as Settings,
  type UserDto
} from '@affiliate/shared';
import { api, failure, load as get } from '$lib/server/api';
import { parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const role = event.locals.user?.role ?? 'VIEWER';
  const [settings, users, audit] = await Promise.all([
    get<Settings>(event, '/api/v1/settings'),
    roleAtLeast(role, 'SUPER_ADMIN') ? get<UserDto[]>(event, '/api/v1/users') : Promise.resolve(null),
    roleAtLeast(role, 'ADMIN')
      ? get<PaginatedResult<AuditLogDto>>(event, '/api/v1/audit-logs', { onlyActions: true, limit: 30 })
      : Promise.resolve(null)
  ]);
  return { settings, users, audit };
};

export const actions: Actions = {
  settings: async (event) => {
    const form = await event.request.formData();
    form.set('syncEnabled', form.get('syncEnabled') === 'on' ? 'true' : 'false');
    const parsed = parseForm(SystemSettingsDto, form, { arrays: ['defaultSyncKeywords'] });
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลไม่ถูกต้อง', errors: parsed.errors });
    const body = { ...parsed.data, defaultSyncKeywords: parsed.data.defaultSyncKeywords ?? [] };
    try {
      await api(event, '/api/v1/settings', { method: 'PUT', body });
      return { success: 'บันทึกการตั้งค่าแล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  },
  createUser: async (event) => {
    const parsed = parseForm(CreateUserBody, await event.request.formData());
    if (!parsed.ok) return fail(400, { message: 'ข้อมูลผู้ใช้ไม่ถูกต้อง (รหัสผ่านอย่างน้อย 12 ตัว)', errors: parsed.errors });
    try {
      await api(event, '/api/v1/users', { method: 'POST', body: parsed.data });
      return { success: 'เพิ่มผู้ใช้แล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  },
  toggleUser: async (event) => {
    const form = await event.request.formData();
    try {
      await api(event, `/api/v1/users/${encodeURIComponent(String(form.get('id')))}`, {
        method: 'PATCH',
        body: { isActive: form.get('isActive') === 'true' }
      });
      return { success: 'อัปเดตผู้ใช้แล้ว' };
    } catch (e) {
      return fail(400, failure(e));
    }
  }
};
