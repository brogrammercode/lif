ALTER TABLE "wallet_topups"
  ADD COLUMN "checkout_kind" TEXT NOT NULL DEFAULT 'LINK',
  ADD COLUMN "provider_order_create_claimed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_checkout_kind_check"
  CHECK ("checkout_kind" IN ('LINK', 'SDK'));
