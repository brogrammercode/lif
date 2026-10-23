-- Additive vehicle verification storage. Existing vehicles remain unchanged.
ALTER TABLE "vehicles"
  ADD COLUMN "brand_id" TEXT,
  ADD COLUMN "model_id" TEXT,
  ADD COLUMN "registration_key" TEXT,
  ADD COLUMN "verification_fields" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "verification_version" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "vehicles_registration_key_key" ON "vehicles"("registration_key");

CREATE TABLE "vehicle_verification_assets" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "vehicle_id" TEXT,
  "field_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_verification_assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehicle_verification_assets_owner_id_vehicle_id_created_at_idx"
  ON "vehicle_verification_assets"("owner_id", "vehicle_id", "created_at");

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "vehicle_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_fkey"
  FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicle_verification_assets" ADD CONSTRAINT "vehicle_verification_assets_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
