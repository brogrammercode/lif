ALTER TABLE "vehicle_categories"
  ADD COLUMN "commission_percent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "vehicle_category_commission_range" CHECK ("commission_percent" BETWEEN 0 AND 100);

ALTER TABLE "wallet_entries"
  ADD COLUMN "commission_paise" BIGINT,
  ADD COLUMN "commission_percent" DECIMAL(5, 2),
  ADD CONSTRAINT "wallet_entry_commission_valid" CHECK (
    ("commission_percent" IS NULL AND "commission_paise" IS NULL) OR (
      "kind" = 'RIDE_EARNING' AND
      "commission_percent" IS NOT NULL AND "commission_percent" BETWEEN 0 AND 100 AND
      "commission_paise" IS NOT NULL AND "commission_paise" >= 0 AND
      "available_delta_paise" >= 0
    )
  );

CREATE INDEX "wallet_entries_ride_earning_cutoff"
  ON "wallet_entries" ("created_at") WHERE "kind" = 'RIDE_EARNING';
