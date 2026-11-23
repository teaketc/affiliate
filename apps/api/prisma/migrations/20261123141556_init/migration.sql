-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('SHOPEE', 'LAZADA');

-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('MALL', 'PREFERRED', 'NORMAL');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "external_product_id" VARCHAR(128),
    "product_name" TEXT NOT NULL,
    "product_image" TEXT,
    "product_images" JSONB NOT NULL DEFAULT '[]',
    "shop_name" VARCHAR(255),
    "shop_type" "ShopType",
    "price" DECIMAL(12,2),
    "original_price" DECIMAL(12,2),
    "currency" VARCHAR(3),
    "product_url" TEXT NOT NULL,
    "affiliate_url" TEXT NOT NULL,
    "raw_data" JSONB,
    "extracted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_logs" (
    "id" UUID NOT NULL,
    "affiliate_url" TEXT NOT NULL,
    "marketplace" "Marketplace",
    "product_id" UUID,
    "status" "ExtractionStatus" NOT NULL,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "extracted_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at" DESC);

-- CreateIndex
CREATE INDEX "products_marketplace_shop_type_idx" ON "products"("marketplace", "shop_type");

-- CreateIndex
CREATE UNIQUE INDEX "products_marketplace_external_product_id_key" ON "products"("marketplace", "external_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_marketplace_product_url_key" ON "products"("marketplace", "product_url");

-- CreateIndex
CREATE INDEX "extraction_logs_created_at_idx" ON "extraction_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "extraction_logs_status_idx" ON "extraction_logs"("status");

-- CreateIndex
CREATE INDEX "extraction_logs_product_id_idx" ON "extraction_logs"("product_id");

-- CreateIndex
CREATE INDEX "extraction_logs_marketplace_idx" ON "extraction_logs"("marketplace");

-- AddForeignKey
ALTER TABLE "extraction_logs" ADD CONSTRAINT "extraction_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Trigram indexes for case-insensitive search on product name and shop name
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "products_product_name_trgm_idx" ON "products" USING GIN ("product_name" gin_trgm_ops);
CREATE INDEX "products_shop_name_trgm_idx" ON "products" USING GIN ("shop_name" gin_trgm_ops);

-- Defence in depth: prices can never be negative
ALTER TABLE "products" ADD CONSTRAINT "products_price_non_negative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_original_price_non_negative" CHECK ("original_price" IS NULL OR "original_price" >= 0);
