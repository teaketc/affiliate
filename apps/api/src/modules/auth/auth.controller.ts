import { Elysia, t } from 'elysia';
import { CreateUserBody, ErrorResponse, LoginBody, LoginResponse, UserDto, UserRoleSchema } from '@affiliate/shared';
import { authPlugin } from '../../plugins/auth';
import { audit, auditAction } from '../../plugins/request-context';
import type { AuthService } from './auth.service';

export function authController(auth: AuthService) {
  return new Elysia({ prefix: '/api/v1' })
    .use(authPlugin(auth))
    .post(
      '/auth/login',
      async ({ body, request }) => {
        const res = await auth.login(body.email, body.password, audit(request).ip);
        auditAction(request, 'auth.login', { email: body.email.toLowerCase() });
        audit(request).userId = res.user.id;
        return res;
      },
      {
        body: LoginBody,
        response: { 200: LoginResponse, 401: ErrorResponse, 429: ErrorResponse },
        detail: { tags: ['Auth'], summary: 'Admin login (returns JWT)' }
      }
    )
    .get('/auth/me', ({ principal }) => auth.me(principal), {
      auth: { role: 'VIEWER' },
      response: { 200: UserDto },
      detail: { tags: ['Auth'], summary: 'Current admin user', security: [{ bearerAuth: [] }] }
    })
    .get('/users', () => auth.listUsers(), {
      auth: { role: 'SUPER_ADMIN' },
      response: { 200: t.Array(UserDto) },
      detail: { tags: ['Users'], security: [{ bearerAuth: [] }] }
    })
    .post(
      '/users',
      async ({ body, request, set }) => {
        const user = await auth.createUser(body);
        auditAction(request, 'user.create', { userId: user.id, role: user.role });
        set.status = 201;
        return user;
      },
      {
        auth: { role: 'SUPER_ADMIN' },
        body: CreateUserBody,
        response: { 201: UserDto, 409: ErrorResponse },
        detail: { tags: ['Users'], security: [{ bearerAuth: [] }] }
      }
    )
    .patch(
      '/users/:id',
      async ({ params, body, principal, request }) => {
        const user = await auth.updateUser(principal, params.id, body);
        auditAction(request, 'user.update', { userId: params.id, ...body });
        return user;
      },
      {
        auth: { role: 'SUPER_ADMIN' },
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body: t.Object({ role: t.Optional(UserRoleSchema), isActive: t.Optional(t.Boolean()) }),
        response: { 200: UserDto },
        detail: { tags: ['Users'], security: [{ bearerAuth: [] }] }
      }
    );
}
