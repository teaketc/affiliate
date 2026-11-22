export const MARKETPLACES = ['SHOPEE', 'LAZADA'] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const USER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'DISABLED', 'ERROR'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const SYNC_TYPES = ['PRODUCTS', 'PRICES'] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

export const SYNC_STATUSES = ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_TRIGGERS = ['SCHEDULED', 'MANUAL'] as const;
export type SyncTrigger = (typeof SYNC_TRIGGERS)[number];

export const PRODUCT_SORTS = [
  'relevance',
  'price_asc',
  'price_desc',
  'discount_desc',
  'commission_desc',
  'sales_desc',
  'updated_desc'
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** API-key scopes. Admin JWTs are governed by role instead. */
export const API_SCOPES = ['products:read', 'affiliate:write', 'affiliate:read', 'analytics:read'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Role hierarchy — a role inherits everything of the roles to its right. */
export const ROLE_RANK: Record<UserRole, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1
};

export function roleAtLeast(role: UserRole, required: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
