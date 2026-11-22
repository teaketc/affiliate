import { fail, redirect } from '@sveltejs/kit';
import { LoginBody, type LoginResponse } from '@affiliate/shared';
import { dev } from '$app/environment';
import { SESSION_COOKIE, api, failure } from '$lib/server/api';
import { parseForm } from '$lib/server/form';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) redirect(303, '/');
};

function safeNext(next: string | null): string {
  // only allow same-site relative paths (prevents open redirects)
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const parsed = parseForm(LoginBody, form);
    if (!parsed.ok) return fail(400, { message: 'กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง', email: String(form.get('email') ?? '') });

    let res: LoginResponse;
    try {
      res = await api<LoginResponse>(event, '/api/v1/auth/login', { method: 'POST', body: parsed.data, token: null });
    } catch (e) {
      return fail(401, { ...failure(e), email: parsed.data.email });
    }
    event.cookies.set(SESSION_COOKIE, res.accessToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: !dev,
      maxAge: res.expiresIn
    });
    redirect(303, safeNext(event.url.searchParams.get('next')));
  }
};
