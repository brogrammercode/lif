ALTER TABLE "driver_payout_methods"
  ADD COLUMN "provider_validation_id" TEXT,
  ADD COLUMN "beneficiary_name_hash" TEXT;
CREATE UNIQUE INDEX "driver_payout_methods_provider_validation_id_key"
  ON "driver_payout_methods" ("provider_validation_id");
