BEGIN;

ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entry_commission_valid",
  ADD CONSTRAINT "wallet_entry_commission_valid" CHECK (
    ("commission_percent" IS NULL AND "commission_paise" IS NULL) OR (
      "commission_percent" IS NOT NULL AND "commission_percent" BETWEEN 0 AND 100 AND
      "commission_paise" IS NOT NULL AND "commission_paise" >= 0 AND (
        ("kind" = 'RIDE_EARNING' AND "available_delta_paise" >= 0) OR (
          "kind" = 'CASH_PAYMENT' AND
          "external_amount_paise" IS NOT NULL AND "external_amount_paise" > 0 AND
          "commission_paise" <= "external_amount_paise" AND
          "available_delta_paise" = 0 AND "held_delta_paise" = 0
        )
      )
    )
  );

COMMIT;
