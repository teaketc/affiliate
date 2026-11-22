import { Elysia } from 'elysia';
import type { AuthService } from '../modules/auth/auth.service';
import type { AuthRequirement, Principal } from '../modules/auth/principal';
import { audit } from './request-context';

/**
 * `auth` macro: `{ auth: { role: 'EDITOR', scope: 'affiliate:write' } }` on a route resolves
 * `principal` into the handler context, or throws 401/403 before the handler runs.
 */
export function authPlugin(auth: AuthService) {
  return new Elysia({ name: 'plugin.auth' }).macro({
    auth(requirement: AuthRequirement) {
      return {
        async resolve({ request }): Promise<{ principal: Principal }> {
          const principal = await auth.authorize(
            {
              authorization: request.headers.get('authorization') ?? undefined,
              apiKey: request.headers.get('x-api-key') ?? undefined
            },
            requirement
          );
          const ctx = audit(request);
          ctx.userId = principal.userId;
          if (principal.kind === 'apiKey') ctx.apiKeyId = principal.apiKeyId;
          return { principal };
        }
      };
    }
  });
}
