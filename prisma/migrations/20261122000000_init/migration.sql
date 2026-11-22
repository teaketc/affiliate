-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('SHOPEE', 'LAZADA');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('PRODUCTS', 'PRICES');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 120,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_providers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" "Marketplace" NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "rate_limit_per_sec" INTEGER NOT NULL DEFAULT 2,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "affiliate_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "region" VARCHAR(2) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "credentials_enc" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "affiliate_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "level" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "shop_id" TEXT,
    "shop_name" TEXT,
    "brand_name" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_url" TEXT NOT NULL,
    "image_url" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'THB',
    "price" DECIMAL(14,2) NOT NULL,
    "original_price" DECIMAL(14,2),
    "discount_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "commission_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(14,2),
    "rating" DECIMAL(3,2),
    "sales_count" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "raw" JSONB NOT NULL DEFAULT '{}',
    -- MANUAL: generated full-text column (Prisma cannot express GENERATED columns)
    "search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple'::regconfig, coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple'::regconfig, coalesce("brand_name", '') || ' ' || coalesce("shop_name", '')), 'B')
    ) STORED,
    "last_synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "original_price" DECIMAL(14,2),
    "stock" INTEGER,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "budget" DECIMAL(14,2),
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "product_id" UUID,
    "campaign_id" UUID,
    "created_by_id" UUID,
    "origin_url" TEXT NOT NULL,
    "short_link" TEXT NOT NULL,
    "short_code" VARCHAR(16) NOT NULL,
    "sub_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "original_price" DECIMAL(14,2),
    "discount_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "commission_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discount_rate" DECIMAL(6,4),
    "commission_rate" DECIMAL(6,4),
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "type" "SyncType" NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "queue_job_id" TEXT,
    "params" JSONB NOT NULL DEFAULT '{}',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "click_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "link_id" UUID NOT NULL,
    "ip_hash" CHAR(64) NOT NULL,
    "user_agent" TEXT,
    "referer" TEXT,
    "country" VARCHAR(2),
    "sub_ids" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "click_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" TEXT NOT NULL,
    "user_id" UUID,
    "api_key_id" UUID,
    "method" VARCHAR(8) NOT NULL,
    "path" TEXT NOT NULL,
    "status" SMALLINT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "ip" TEXT,
    "action" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_providers_code_key" ON "affiliate_providers"("code");

-- CreateIndex
CREATE INDEX "affiliate_accounts_status_idx" ON "affiliate_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_accounts_provider_id_name_key" ON "affiliate_accounts"("provider_id", "name");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_provider_id_slug_idx" ON "categories"("provider_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_provider_id_external_id_key" ON "categories"("provider_id", "external_id");

-- CreateIndex
CREATE INDEX "products_provider_id_price_idx" ON "products"("provider_id", "price");

-- CreateIndex
CREATE INDEX "products_provider_id_commission_rate_idx" ON "products"("provider_id", "commission_rate" DESC);

-- CreateIndex
CREATE INDEX "products_provider_id_discount_rate_idx" ON "products"("provider_id", "discount_rate" DESC);

-- CreateIndex
CREATE INDEX "products_provider_id_sales_count_idx" ON "products"("provider_id", "sales_count" DESC);

-- CreateIndex
CREATE INDEX "products_updated_at_idx" ON "products"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_raw_idx" ON "products" USING GIN ("raw" jsonb_path_ops);

-- CreateIndex
CREATE UNIQUE INDEX "products_provider_id_external_id_key" ON "products"("provider_id", "external_id");

-- CreateIndex
CREATE INDEX "product_images_product_id_position_idx" ON "product_images"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_url_key" ON "product_images"("product_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_external_id_key" ON "product_variants"("product_id", "external_id");

-- CreateIndex
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_account_id_code_key" ON "campaigns"("account_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_links_short_code_key" ON "affiliate_links"("short_code");

-- CreateIndex
CREATE INDEX "affiliate_links_account_id_created_at_idx" ON "affiliate_links"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "affiliate_links_campaign_id_created_at_idx" ON "affiliate_links"("campaign_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "affiliate_links_product_id_idx" ON "affiliate_links"("product_id");

-- CreateIndex
CREATE INDEX "price_histories_product_id_recorded_at_idx" ON "price_histories"("product_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "promotions_ends_at_idx" ON "promotions"("ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_product_id_type_external_id_key" ON "promotions"("product_id", "type", "external_id");

-- CreateIndex
CREATE INDEX "sync_jobs_status_created_at_idx" ON "sync_jobs"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sync_jobs_account_id_created_at_idx" ON "sync_jobs"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "click_events_link_id_created_at_idx" ON "click_events"("link_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "click_events_created_at_idx" ON "click_events" USING BRIN ("created_at");

-- CreateIndex
CREATE INDEX "api_logs_created_at_idx" ON "api_logs" USING BRIN ("created_at");

-- CreateIndex
CREATE INDEX "api_logs_user_id_created_at_idx" ON "api_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "api_logs_action_created_at_idx" ON "api_logs"("action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_accounts" ADD CONSTRAINT "affiliate_accounts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "affiliate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "affiliate_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "affiliate_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "affiliate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "affiliate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "affiliate_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "affiliate_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =====================================================================
-- MANUAL: data integrity constraints
-- =====================================================================
ALTER TABLE "products"
  ADD CONSTRAINT "products_price_nonneg_chk" CHECK ("price" >= 0),
  ADD CONSTRAINT "products_original_price_chk" CHECK ("original_price" IS NULL OR "original_price" >= 0),
  ADD CONSTRAINT "products_discount_rate_chk" CHECK ("discount_rate" >= 0 AND "discount_rate" <= 1),
  ADD CONSTRAINT "products_commission_rate_chk" CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1),
  ADD CONSTRAINT "products_rating_chk" CHECK ("rating" IS NULL OR ("rating" >= 0 AND "rating" <= 5));

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_chk" CHECK ("price" >= 0);
ALTER TABLE "price_histories" ADD CONSTRAINT "price_histories_price_chk" CHECK ("price" >= 0);
ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_dates_chk" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" > "starts_at"),
  ADD CONSTRAINT "campaigns_budget_chk" CHECK ("budget" IS NULL OR "budget" >= 0);
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_sub_ids_chk" CHECK (cardinality("sub_ids") <= 6);
ALTER TABLE "users" ADD CONSTRAINT "users_email_lower_chk" CHECK ("email" = lower("email"));

-- =====================================================================
-- MANUAL: reference data — the two supported marketplaces
-- =====================================================================
INSERT INTO "affiliate_providers" ("id", "code", "name", "base_url", "rate_limit_per_sec", "updated_at") VALUES
  (gen_random_uuid(), 'SHOPEE', 'Shopee Affiliate Open API', 'https://open-api.affiliate.shopee.co.th/graphql', 2, now()),
  (gen_random_uuid(), 'LAZADA', 'Lazada Open Platform (Affiliate)', 'https://api.lazada.co.th/rest', 5, now())
ON CONFLICT ("code") DO NOTHING;
