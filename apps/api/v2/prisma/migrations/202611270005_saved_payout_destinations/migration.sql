ALTER TYPE "PayoutMethodKind" ADD VALUE 'BANK_ACCOUNT';

ALTER TABLE "driver_payout_methods"
  ADD COLUMN "pending_details" TEXT,
  ADD COLUMN "link_attempted_at" TIMESTAMPTZ(3);
