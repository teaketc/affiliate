import { Type, type Static, type TSchema } from '@sinclair/typebox';
import type {
  AccountStatus,
  ApiScope,
  CampaignStatus,
  Marketplace,
  ProductSort,
  SyncStatus,
  SyncTrigger,
  SyncType,
  UserRole
} from './enums';

/** NUMERIC values are transported as strings to keep exact precision. */
export const DecimalString = Type.String({ pattern: '^-?\\d+(\\.\\d+)?$', examples: ['199.00'] });
export const Uuid = Type.String({ format: 'uuid' });
export const IsoDate = Type.String({ format: 'date-time' });

/**
 * Integer for query strings. Elysia coerces `Number` query params from strings, but not TypeBox
 * `Integer`, so query integers are Numbers constrained with multipleOf: 1.
 */
export const QueryInt = (opts: { minimum?: number; maximum?: number; default?: number } = {}) =>
  Type.Number({ ...opts, multipleOf: 1 });

export const MarketplaceSchema = Type.Union([Type.Literal('SHOPEE'), Type.Literal('LAZADA')]);
export const UserRoleSchema = Type.Union([Type.Literal('SUPER_ADMIN'), Type.Literal('ADMIN'), Type.Literal('EDITOR'), Type.Literal('VIEWER')]);
export const AccountStatusSchema = Type.Union([Type.Literal('ACTIVE'), Type.Literal('DISABLED'), Type.Literal('ERROR')]);
export const CampaignStatusSchema = Type.Union([Type.Literal('DRAFT'), Type.Literal('ACTIVE'), Type.Literal('PAUSED'), Type.Literal('ENDED')]);
export const SyncTypeSchema = Type.Union([Type.Literal('PRODUCTS'), Type.Literal('PRICES')]);
export const SyncStatusSchema = Type.Union([Type.Literal('QUEUED'), Type.Literal('RUNNING'), Type.Literal('SUCCESS'), Type.Literal('FAILED'), Type.Literal('CANCELLED')]);
export const SyncTriggerSchema = Type.Union([Type.Literal('SCHEDULED'), Type.Literal('MANUAL')]);
export const ProductSortSchema = Type.Union([Type.Literal('relevance'), Type.Literal('price_asc'), Type.Literal('price_desc'), Type.Literal('discount_desc'), Type.Literal('commission_desc'), Type.Literal('sales_desc'), Type.Literal('updated_desc')]);
export const ApiScopeSchema = Type.Union([Type.Literal('products:read'), Type.Literal('affiliate:write'), Type.Literal('affiliate:read'), Type.Literal('analytics:read')]);

// ---------- envelopes ----------
export const ErrorResponse = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    requestId: Type.Optional(Type.String()),
    details: Type.Optional(Type.Unknown())
  })
});
export type ErrorResponse = Static<typeof ErrorResponse>;

export const PageMeta = Type.Object({
  page: Type.Integer(),
  limit: Type.Integer(),
  total: Type.Integer(),
  totalPages: Type.Integer()
});
export type PageMeta = Static<typeof PageMeta>;

export function Paginated<T extends TSchema>(item: T) {
  return Type.Object({ data: Type.Array(item), meta: PageMeta });
}
export interface PaginatedResult<T> {
  data: T[];
  meta: PageMeta;
}

export const PaginationQuery = Type.Object({
  page: Type.Optional(QueryInt({ minimum: 1, default: 1 })),
  limit: Type.Optional(QueryInt({ minimum: 1, maximum: 100, default: 20 }))
});
export type PaginationQuery = Static<typeof PaginationQuery>;

// ---------- auth ----------
export const LoginBody = Type.Object({
  email: Type.String({ format: 'email', maxLength: 254 }),
  password: Type.String({ minLength: 8, maxLength: 200 })
});
export type LoginBody = Static<typeof LoginBody>;

export const UserDto = Type.Object({
  id: Uuid,
  email: Type.String(),
  name: Type.String(),
  role: UserRoleSchema,
  isActive: Type.Boolean(),
  lastLoginAt: Type.Union([IsoDate, Type.Null()]),
  createdAt: IsoDate
});
export type UserDto = Static<typeof UserDto>;

export const LoginResponse = Type.Object({
  accessToken: Type.String(),
  expiresIn: Type.Integer(),
  user: UserDto
});
export type LoginResponse = Static<typeof LoginResponse>;

export const CreateUserBody = Type.Object({
  email: Type.String({ format: 'email', maxLength: 254 }),
  name: Type.String({ minLength: 1, maxLength: 120 }),
  password: Type.String({ minLength: 12, maxLength: 200 }),
  role: UserRoleSchema
});
export type CreateUserBody = Static<typeof CreateUserBody>;

// ---------- api keys ----------
export const ApiKeyDto = Type.Object({
  id: Uuid,
  name: Type.String(),
  prefix: Type.String(),
  scopes: Type.Array(ApiScopeSchema),
  rateLimitPerMin: Type.Integer(),
  lastUsedAt: Type.Union([IsoDate, Type.Null()]),
  expiresAt: Type.Union([IsoDate, Type.Null()]),
  revokedAt: Type.Union([IsoDate, Type.Null()]),
  createdAt: IsoDate
});
export type ApiKeyDto = Static<typeof ApiKeyDto>;

export const CreateApiKeyBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  scopes: Type.Array(ApiScopeSchema, { minItems: 1, uniqueItems: true }),
  rateLimitPerMin: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })),
  expiresAt: Type.Optional(IsoDate)
});
export type CreateApiKeyBody = Static<typeof CreateApiKeyBody>;

export const CreatedApiKeyDto = Type.Composite([ApiKeyDto, Type.Object({ key: Type.String() })]);
export type CreatedApiKeyDto = Static<typeof CreatedApiKeyDto>;

// ---------- providers & accounts ----------
export const ProviderDto = Type.Object({
  id: Uuid,
  code: MarketplaceSchema,
  name: Type.String(),
  baseUrl: Type.String(),
  rateLimitPerSec: Type.Integer(),
  isEnabled: Type.Boolean(),
  accountCount: Type.Integer(),
  productCount: Type.Integer()
});
export type ProviderDto = Static<typeof ProviderDto>;

export const UpdateProviderBody = Type.Object({
  rateLimitPerSec: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  isEnabled: Type.Optional(Type.Boolean())
});
export type UpdateProviderBody = Static<typeof UpdateProviderBody>;

export const ShopeeCredentials = Type.Object({
  appId: Type.String({ minLength: 1 }),
  secret: Type.String({ minLength: 1 })
});
export type ShopeeCredentials = Static<typeof ShopeeCredentials>;

export const LazadaCredentials = Type.Object({
  appKey: Type.String({ minLength: 1 }),
  appSecret: Type.String({ minLength: 1 }),
  /** Affiliate userToken from the Lazada affiliate portal */
  userToken: Type.String({ minLength: 1 })
});
export type LazadaCredentials = Static<typeof LazadaCredentials>;

export const AccountDto = Type.Object({
  id: Uuid,
  providerId: Uuid,
  marketplace: MarketplaceSchema,
  name: Type.String(),
  region: Type.String(),
  endpoint: Type.String(),
  status: AccountStatusSchema,
  hasCredentials: Type.Boolean(),
  lastSyncedAt: Type.Union([IsoDate, Type.Null()]),
  createdAt: IsoDate
});
export type AccountDto = Static<typeof AccountDto>;

export const CreateAccountBody = Type.Object({
  marketplace: MarketplaceSchema,
  name: Type.String({ minLength: 1, maxLength: 100 }),
  region: Type.String({ pattern: '^[A-Z]{2}$' }),
  endpoint: Type.String({ format: 'uri' }),
  credentials: Type.Union([ShopeeCredentials, LazadaCredentials])
});
export type CreateAccountBody = Static<typeof CreateAccountBody>;

export const UpdateAccountBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  endpoint: Type.Optional(Type.String({ format: 'uri' })),
  status: Type.Optional(AccountStatusSchema),
  credentials: Type.Optional(Type.Union([ShopeeCredentials, LazadaCredentials]))
});
export type UpdateAccountBody = Static<typeof UpdateAccountBody>;

// ---------- categories ----------
export const CategoryDto = Type.Object({
  id: Uuid,
  marketplace: MarketplaceSchema,
  externalId: Type.String(),
  parentId: Type.Union([Uuid, Type.Null()]),
  name: Type.String(),
  slug: Type.String(),
  level: Type.Integer(),
  productCount: Type.Integer()
});
export type CategoryDto = Static<typeof CategoryDto>;

export const CategoryQuery = Type.Object({
  marketplace: Type.Optional(MarketplaceSchema),
  parentId: Type.Optional(Uuid)
});
export type CategoryQuery = Static<typeof CategoryQuery>;

// ---------- products ----------
export const ProductListQuery = Type.Object({
  page: Type.Optional(QueryInt({ minimum: 1, default: 1 })),
  limit: Type.Optional(QueryInt({ minimum: 1, maximum: 100, default: 20 })),
  q: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  marketplace: Type.Optional(MarketplaceSchema),
  categoryId: Type.Optional(Uuid),
  minPrice: Type.Optional(Type.Number({ minimum: 0 })),
  maxPrice: Type.Optional(Type.Number({ minimum: 0 })),
  /** 0..100 percent */
  minDiscount: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  /** 0..100 percent */
  minCommission: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  sort: Type.Optional(ProductSortSchema)
});
export type ProductListQuery = Static<typeof ProductListQuery>;

export const ProductSearchQuery = Type.Composite([
  Type.Omit(ProductListQuery, ['q']),
  Type.Object({ q: Type.String({ minLength: 1, maxLength: 200 }) })
]);
export type ProductSearchQuery = Static<typeof ProductSearchQuery>;

export const ProductImageDto = Type.Object({ id: Uuid, url: Type.String(), position: Type.Integer() });
export const ProductVariantDto = Type.Object({
  id: Uuid,
  externalId: Type.String(),
  name: Type.String(),
  price: DecimalString,
  originalPrice: Type.Union([DecimalString, Type.Null()]),
  stock: Type.Union([Type.Integer(), Type.Null()]),
  attributes: Type.Record(Type.String(), Type.Unknown())
});

export const ProductSummaryDto = Type.Object({
  id: Uuid,
  marketplace: MarketplaceSchema,
  externalId: Type.String(),
  name: Type.String(),
  shopName: Type.Union([Type.String(), Type.Null()]),
  imageUrl: Type.Union([Type.String(), Type.Null()]),
  productUrl: Type.String(),
  currency: Type.String(),
  price: DecimalString,
  originalPrice: Type.Union([DecimalString, Type.Null()]),
  discountRate: DecimalString,
  commissionRate: DecimalString,
  commissionAmount: Type.Union([DecimalString, Type.Null()]),
  rating: Type.Union([DecimalString, Type.Null()]),
  salesCount: Type.Integer(),
  updatedAt: IsoDate
});
export type ProductSummaryDto = Static<typeof ProductSummaryDto>;

export const PromotionDto = Type.Object({
  id: Uuid,
  type: Type.String(),
  name: Type.String(),
  discountRate: Type.Union([DecimalString, Type.Null()]),
  commissionRate: Type.Union([DecimalString, Type.Null()]),
  startsAt: Type.Union([IsoDate, Type.Null()]),
  endsAt: Type.Union([IsoDate, Type.Null()])
});
export type PromotionDto = Static<typeof PromotionDto>;

export const ProductDetailDto = Type.Composite([
  ProductSummaryDto,
  Type.Object({
    description: Type.Union([Type.String(), Type.Null()]),
    brandName: Type.Union([Type.String(), Type.Null()]),
    shopId: Type.Union([Type.String(), Type.Null()]),
    stock: Type.Union([Type.Integer(), Type.Null()]),
    images: Type.Array(ProductImageDto),
    variants: Type.Array(ProductVariantDto),
    categories: Type.Array(Type.Object({ id: Uuid, name: Type.String() })),
    promotions: Type.Array(PromotionDto),
    lastSyncedAt: IsoDate
  })
]);
export type ProductDetailDto = Static<typeof ProductDetailDto>;

// ---------- affiliate ----------
export const GenerateLinkBody = Type.Object({
  accountId: Uuid,
  /** Either a stored product or an arbitrary marketplace URL */
  productId: Type.Optional(Uuid),
  originUrl: Type.Optional(Type.String({ format: 'uri', maxLength: 2048 })),
  campaignId: Type.Optional(Uuid),
  /** Up to 5 (Shopee) / 6 (Lazada) sub ids, alphanumeric */
  subIds: Type.Optional(
    Type.Array(Type.String({ pattern: '^[A-Za-z0-9_-]{0,50}$' }), { maxItems: 6 })
  )
});
export type GenerateLinkBody = Static<typeof GenerateLinkBody>;

export const AffiliateLinkDto = Type.Object({
  id: Uuid,
  accountId: Uuid,
  marketplace: MarketplaceSchema,
  productId: Type.Union([Uuid, Type.Null()]),
  productName: Type.Union([Type.String(), Type.Null()]),
  campaignId: Type.Union([Uuid, Type.Null()]),
  campaignName: Type.Union([Type.String(), Type.Null()]),
  originUrl: Type.String(),
  shortLink: Type.String(),
  trackingUrl: Type.String(),
  subIds: Type.Array(Type.String()),
  clickCount: Type.Integer(),
  createdAt: IsoDate
});
export type AffiliateLinkDto = Static<typeof AffiliateLinkDto>;

export const LinkListQuery = Type.Object({
  page: Type.Optional(QueryInt({ minimum: 1, default: 1 })),
  limit: Type.Optional(QueryInt({ minimum: 1, maximum: 100, default: 20 })),
  accountId: Type.Optional(Uuid),
  campaignId: Type.Optional(Uuid),
  productId: Type.Optional(Uuid)
});
export type LinkListQuery = Static<typeof LinkListQuery>;

// ---------- campaigns ----------
export const CampaignDto = Type.Object({
  id: Uuid,
  accountId: Uuid,
  name: Type.String(),
  code: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  status: CampaignStatusSchema,
  budget: Type.Union([DecimalString, Type.Null()]),
  startsAt: Type.Union([IsoDate, Type.Null()]),
  endsAt: Type.Union([IsoDate, Type.Null()]),
  linkCount: Type.Integer(),
  clickCount: Type.Integer(),
  createdAt: IsoDate
});
export type CampaignDto = Static<typeof CampaignDto>;

export const CreateCampaignBody = Type.Object({
  accountId: Uuid,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  code: Type.String({ pattern: '^[A-Za-z0-9_-]{1,50}$' }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  status: Type.Optional(CampaignStatusSchema),
  budget: Type.Optional(DecimalString),
  startsAt: Type.Optional(IsoDate),
  endsAt: Type.Optional(IsoDate)
});
export type CreateCampaignBody = Static<typeof CreateCampaignBody>;

export const UpdateCampaignBody = Type.Partial(Type.Omit(CreateCampaignBody, ['accountId', 'code']));
export type UpdateCampaignBody = Static<typeof UpdateCampaignBody>;

// ---------- price history ----------
export const PriceHistoryQuery = Type.Object({
  days: Type.Optional(QueryInt({ minimum: 1, maximum: 365, default: 30 }))
});
export type PriceHistoryQuery = Static<typeof PriceHistoryQuery>;

export const PricePointDto = Type.Object({
  price: DecimalString,
  originalPrice: Type.Union([DecimalString, Type.Null()]),
  discountRate: DecimalString,
  commissionRate: DecimalString,
  recordedAt: IsoDate
});
export type PricePointDto = Static<typeof PricePointDto>;

export const PriceHistoryDto = Type.Object({
  productId: Uuid,
  currency: Type.String(),
  current: DecimalString,
  lowest: DecimalString,
  highest: DecimalString,
  average: DecimalString,
  points: Type.Array(PricePointDto)
});
export type PriceHistoryDto = Static<typeof PriceHistoryDto>;

export const PriceCompareQuery = Type.Object({
  ids: Type.String({ description: 'Comma separated product ids (2-10)' })
});
export type PriceCompareQuery = Static<typeof PriceCompareQuery>;

// ---------- sync ----------
export const SyncJobDto = Type.Object({
  id: Uuid,
  accountId: Uuid,
  accountName: Type.String(),
  marketplace: MarketplaceSchema,
  type: SyncTypeSchema,
  trigger: SyncTriggerSchema,
  status: SyncStatusSchema,
  params: Type.Record(Type.String(), Type.Unknown()),
  stats: Type.Record(Type.String(), Type.Unknown()),
  attempts: Type.Integer(),
  error: Type.Union([Type.String(), Type.Null()]),
  startedAt: Type.Union([IsoDate, Type.Null()]),
  finishedAt: Type.Union([IsoDate, Type.Null()]),
  createdAt: IsoDate
});
export type SyncJobDto = Static<typeof SyncJobDto>;

export const SyncJobQuery = Type.Object({
  page: Type.Optional(QueryInt({ minimum: 1, default: 1 })),
  limit: Type.Optional(QueryInt({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(SyncStatusSchema),
  accountId: Type.Optional(Uuid)
});
export type SyncJobQuery = Static<typeof SyncJobQuery>;

export const SyncProductsBody = Type.Object({
  accountId: Uuid,
  type: Type.Optional(SyncTypeSchema),
  keyword: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  /** Marketplace category id (Shopee productCatId / Lazada categoryL1) */
  categoryExternalId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  maxPages: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 5 }))
});
export type SyncProductsBody = Static<typeof SyncProductsBody>;

// ---------- analytics ----------
export const AnalyticsQuery = Type.Object({
  days: Type.Optional(QueryInt({ minimum: 1, maximum: 365, default: 30 }))
});
export type AnalyticsQuery = Static<typeof AnalyticsQuery>;

export const AnalyticsOverviewDto = Type.Object({
  totals: Type.Object({
    products: Type.Integer(),
    activeAccounts: Type.Integer(),
    links: Type.Integer(),
    clicks: Type.Integer(),
    activeCampaigns: Type.Integer()
  }),
  byMarketplace: Type.Array(
    Type.Object({
      marketplace: MarketplaceSchema,
      products: Type.Integer(),
      links: Type.Integer(),
      clicks: Type.Integer(),
      avgCommissionRate: DecimalString
    })
  ),
  clicksByDay: Type.Array(Type.Object({ date: Type.String(), clicks: Type.Integer() })),
  topLinks: Type.Array(
    Type.Object({
      id: Uuid,
      productName: Type.Union([Type.String(), Type.Null()]),
      shortLink: Type.String(),
      clicks: Type.Integer()
    })
  ),
  sync: Type.Object({
    last24h: Type.Object({ success: Type.Integer(), failed: Type.Integer(), running: Type.Integer() })
  })
});
export type AnalyticsOverviewDto = Static<typeof AnalyticsOverviewDto>;

// ---------- settings / audit ----------
export const SystemSettingsDto = Type.Object({
  syncCron: Type.String({ minLength: 9, maxLength: 100, examples: ['0 */6 * * *'] }),
  syncEnabled: Type.Boolean(),
  priceHistoryRetentionDays: Type.Integer({ minimum: 7, maximum: 3650 }),
  clickRetentionDays: Type.Integer({ minimum: 7, maximum: 3650 }),
  defaultSyncKeywords: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 50 })
});
export type SystemSettingsDto = Static<typeof SystemSettingsDto>;

export const AuditLogDto = Type.Object({
  id: Uuid,
  requestId: Type.String(),
  userEmail: Type.Union([Type.String(), Type.Null()]),
  apiKeyPrefix: Type.Union([Type.String(), Type.Null()]),
  method: Type.String(),
  path: Type.String(),
  status: Type.Integer(),
  durationMs: Type.Integer(),
  action: Type.Union([Type.String(), Type.Null()]),
  createdAt: IsoDate
});
export type AuditLogDto = Static<typeof AuditLogDto>;

// ---------- compile-time guard: schema literals must match the enum arrays ----------
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const enumChecks: [
  Same<Static<typeof MarketplaceSchema>, Marketplace>,
  Same<Static<typeof UserRoleSchema>, UserRole>,
  Same<Static<typeof AccountStatusSchema>, AccountStatus>,
  Same<Static<typeof CampaignStatusSchema>, CampaignStatus>,
  Same<Static<typeof SyncTypeSchema>, SyncType>,
  Same<Static<typeof SyncStatusSchema>, SyncStatus>,
  Same<Static<typeof SyncTriggerSchema>, SyncTrigger>,
  Same<Static<typeof ProductSortSchema>, ProductSort>,
  Same<Static<typeof ApiScopeSchema>, ApiScope>
] = [true, true, true, true, true, true, true, true, true];
void enumChecks;
