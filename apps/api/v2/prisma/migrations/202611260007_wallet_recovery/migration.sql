ALTER TABLE "driver_payout_methods" ADD COLUMN "destination_hash" TEXT;
ALTER TABLE "wallet_topups" ADD COLUMN "credited_net_of_refund_paise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "wallet_topups" ADD COLUMN "reviewed_chargeback_paise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "wallet_provider_events" ADD COLUMN "object_id" TEXT,
  ADD COLUMN "reconciled_at" TIMESTAMPTZ(3);
ALTER TABLE "driver_payout_attempts" ADD COLUMN "first_submitted_at" TIMESTAMPTZ(3);

UPDATE "driver_payout_attempts"
SET "first_submitted_at" = "created_at"
WHERE "status" = 'PROCESSING' OR "failure_code" = 'SUBMISSION_UNCONFIRMED';

UPDATE "driver_payout_attempts"
SET "next_retry_at" = "created_at"
WHERE "status" = 'READY' AND "next_retry_at" IS NULL;
