import { Elysia, t } from 'elysia';
import { ApiKeyDto, CreateApiKeyBody, CreatedApiKeyDto } from '@affiliate/shared';
import { authPlugin } from '../../plugins/auth';
import { auditAction } from '../../plugins/request-context';
import type { AuthService } from '../auth/auth.service';
import type { ApiKeyService } from './api-key.service';

const security = [{ bearerAuth: [] }];

export function apiKeyController(auth: AuthService, keys: ApiKeyService) {
  return new Elysia({ prefix: '/api/v1/api-keys' })
    .use(authPlugin(auth))
    .get('', ({ principal }) => keys.list(principal), {
      auth: { role: 'ADMIN' },
      response: { 200: t.Array(ApiKeyDto) },
      detail: { tags: ['API Keys'], security }
    })
    .post(
      '',
      async ({ principal, body, request, set }) => {
        const created = await keys.create(principal, body);
        auditAction(request, 'api-key.create', { apiKeyId: created.id, scopes: created.scopes });
        set.status = 201;
        return created;
      },
      {
        auth: { role: 'ADMIN' },
        body: CreateApiKeyBody,
        response: { 201: CreatedApiKeyDto },
        detail: { tags: ['API Keys'], summary: 'Create key (plaintext returned once)', security }
      }
    )
    .delete(
      '/:id',
      async ({ principal, params, request }) => {
        const k = await keys.revoke(principal, params.id);
        auditAction(request, 'api-key.revoke', { apiKeyId: params.id });
        return k;
      },
      {
        auth: { role: 'ADMIN' },
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        response: { 200: ApiKeyDto },
        detail: { tags: ['API Keys'], summary: 'Revoke key', security }
      }
    );
}
