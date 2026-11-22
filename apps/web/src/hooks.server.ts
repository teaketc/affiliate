import { redirect, type Handle } from '@sveltejs/kit';
import type { UserDto } from '@affiliate/shared';
import { ApiError, SESSION_COOKIE, api } from '$lib/server/api';

const PUBLIC = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.token = event.cookies.get(SESSION_COOKIE) ?? null;
  event.locals.user = null;

  if (event.locals.token) {
    try {
      event.locals.user = await api<UserDto>(event, '/api/v1/auth/me');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        event.cookies.delete(SESSION_COOKIE, { path: '/' });
        event.locals.token = null;
      } else {
        throw e;
      }
    }
  }

  const isPublic = PUBLIC.some((p) => event.url.pathname.startsWith(p));
  if (!event.locals.user && !isPublic) {
    redirect(303, `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
  }

  const response = await resolve(event);
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'same-origin');
  return response;
};
