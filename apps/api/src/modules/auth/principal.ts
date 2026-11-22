import type { ApiScope, UserRole } from '@affiliate/shared';

export type Principal =
  | { kind: 'user'; userId: string; email: string; role: UserRole }
  | { kind: 'apiKey'; apiKeyId: string; userId: string; scopes: ApiScope[]; rateLimitPerMin: number };

/**
 * Endpoint requirement.
 *  - `role`: minimum admin role for JWT users
 *  - `scope`: if set, API keys holding this scope are accepted as well
 */
export interface AuthRequirement {
  /** Required (use 'VIEWER' for any signed-in admin) — Elysia macros need a non-empty object */
  role: UserRole;
  scope?: ApiScope;
}
