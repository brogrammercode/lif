ALTER TABLE "wallet_topups"
  ADD COLUMN "provider_link_id" TEXT,
  ADD COLUMN "checkout_url" TEXT,
  ADD COLUMN "provider_mode" TEXT;

CREATE UNIQUE INDEX "wallet_topups_provider_link_id_key" ON "wallet_topups" ("provider_link_id");
ALTER TABLE "wallet_provider_events" ADD COLUMN "subject_id" TEXT;
CREATE INDEX "wallet_provider_events_provider_subject_id_idx" ON "wallet_provider_events" ("provider", "subject_id");
