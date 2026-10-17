-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('REQUESTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RequirementFieldType" AS ENUM ('STRING', 'TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'FILE', 'IMAGE', 'PDF');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_admin_login_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_login_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "admin_activity" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status_code" INTEGER,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "admin_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "description" TEXT,
    "country" TEXT,
    "website_url" TEXT,
    "logo_url" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'VERIFIED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requested_by_id" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "description" TEXT,
    "vehicle_type" "VehicleType" NOT NULL,
    "fuel_type" TEXT NOT NULL,
    "seating_capacity" INTEGER NOT NULL,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "logo_url" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'VERIFIED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requested_by_id" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "requirement_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_requirements" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "RequirementFieldType" NOT NULL,
    "description" TEXT,
    "placeholder" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "max_length" INTEGER,
    "max_file_size_mb" INTEGER,
    "allowed_extensions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allow_multiple" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_activity_request_id_key" ON "admin_activity"("request_id");

-- CreateIndex
CREATE INDEX "admin_activity_actor_id_started_at_idx" ON "admin_activity"("actor_id", "started_at");

-- CreateIndex
CREATE INDEX "admin_activity_started_at_idx" ON "admin_activity"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brands_normalized_name_key" ON "vehicle_brands"("normalized_name");

-- CreateIndex
CREATE INDEX "vehicle_brands_status_is_active_idx" ON "vehicle_brands"("status", "is_active");

-- CreateIndex
CREATE INDEX "vehicle_models_brand_id_status_is_active_idx" ON "vehicle_models"("brand_id", "status", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_brand_id_normalized_name_key" ON "vehicle_models"("brand_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_categories_normalized_name_key" ON "requirement_categories"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "partner_requirements_key_key" ON "partner_requirements"("key");

-- CreateIndex
CREATE INDEX "partner_requirements_category_id_is_active_sort_order_idx" ON "partner_requirements"("category_id", "is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "admin_activity" ADD CONSTRAINT "admin_activity_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_brands" ADD CONSTRAINT "vehicle_brands_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_brands" ADD CONSTRAINT "vehicle_brands_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "vehicle_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_requirements" ADD CONSTRAINT "partner_requirements_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "requirement_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
