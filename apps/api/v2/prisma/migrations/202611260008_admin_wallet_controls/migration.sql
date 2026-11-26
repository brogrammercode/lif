CREATE TYPE "WalletTopUpMode" AS ENUM ('disabled', 'test', 'live');

ALTER TABLE "payout_schedules"
  ADD COLUMN "wallet_ride_collection_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wallet_topup_mode" "WalletTopUpMode" NOT NULL DEFAULT 'disabled',
  ADD COLUMN "wallet_live_topup_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "razorpay_x_upi_setup_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "razorpay_x_transfers_enabled" BOOLEAN NOT NULL DEFAULT false;
