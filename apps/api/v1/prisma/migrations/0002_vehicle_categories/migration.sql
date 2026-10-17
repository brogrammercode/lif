CREATE TABLE "vehicle_categories" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "image_url" TEXT,
  "parent_id" TEXT,
  "vehicle_type" "VehicleType" NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "base_fare" DECIMAL(12,2) NOT NULL,
  "per_kilometer" DECIMAL(12,2) NOT NULL,
  "per_minute" DECIMAL(12,2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicle_categories_capacity_check" CHECK ("capacity" BETWEEN 1 AND 8),
  CONSTRAINT "vehicle_categories_rates_check" CHECK ("base_fare" >= 0 AND "per_kilometer" >= 0 AND "per_minute" >= 0),
  CONSTRAINT "vehicle_categories_not_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);
CREATE UNIQUE INDEX "vehicle_categories_code_key" ON "vehicle_categories"("code");
CREATE INDEX "vehicle_categories_parent_id_is_active_sort_order_idx" ON "vehicle_categories"("parent_id", "is_active", "sort_order");
ALTER TABLE "vehicle_categories" ADD CONSTRAINT "vehicle_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "vehicle_categories" ("id", "code", "name", "description", "vehicle_type", "capacity", "base_fare", "per_kilometer", "per_minute", "sort_order") VALUES
('1760000000001', 'BIKE', 'Bike', 'Quick everyday rides on two wheels.', 'BIKE', 1, 25, 8, 1, 10),
('1760000000002', 'SCOOTER', 'Scooter', 'Comfortable short city rides.', 'SCOOTER', 1, 30, 9, 1, 20),
('1760000000003', 'AUTO', 'Auto', 'Practical three-wheeler city rides.', 'AUTO', 3, 45, 12, 2, 30),
('1760000000004', 'SEDAN', 'Sedan', 'Comfortable everyday car rides.', 'SEDAN', 4, 80, 18, 3, 40),
('1760000000005', 'SUV', 'SUV', 'Extra space for your journey.', 'SUV', 6, 120, 24, 4, 50);

ALTER TABLE "vehicles" ADD COLUMN "vehicle_category_id" TEXT;
ALTER TABLE "fare_quotes" ADD COLUMN "vehicle_category_id" TEXT, ADD COLUMN "category_snapshot" JSONB;
UPDATE "vehicles" AS v SET "vehicle_category_id" = c."id" FROM "vehicle_categories" AS c WHERE c."vehicle_type" = v."type";
UPDATE "fare_quotes" AS q SET "vehicle_category_id" = c."id", "category_snapshot" = jsonb_build_object('name', c."name", 'description', c."description", 'image_url', c."image_url", 'capacity', c."capacity", 'parent_name', NULL) FROM "vehicle_categories" AS c WHERE c."vehicle_type" = q."vehicle_type";
CREATE INDEX "vehicles_vehicle_category_id_idx" ON "vehicles"("vehicle_category_id");
CREATE INDEX "fare_quotes_vehicle_category_id_idx" ON "fare_quotes"("vehicle_category_id");
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_category_id_fkey" FOREIGN KEY ("vehicle_category_id") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fare_quotes" ADD CONSTRAINT "fare_quotes_vehicle_category_id_fkey" FOREIGN KEY ("vehicle_category_id") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
