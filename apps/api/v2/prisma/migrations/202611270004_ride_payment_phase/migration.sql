ALTER TYPE "WalletEntryKind" ADD VALUE 'CASH_PAYMENT';
ALTER TABLE "wallet_entries" ADD COLUMN "external_amount_paise" BIGINT;
ALTER TABLE "payments" ADD COLUMN "provider_order_id" TEXT,
  ADD COLUMN "provider_order_claimed" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "payments_provider_order_id_key" ON "payments"("provider_order_id");
ALTER TABLE "payout_schedules" ADD COLUMN "razorpay_ride_upi_enabled" BOOLEAN NOT NULL DEFAULT false;
