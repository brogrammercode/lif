-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('RIDER', 'DRIVER');

-- CreateEnum
CREATE TYPE "WalletEntryKind" AS ENUM ('TOP_UP', 'RIDE_DEBIT', 'RIDE_EARNING', 'REFUND', 'ADJUSTMENT', 'PAYOUT_HOLD', 'PAYOUT_SETTLED', 'PAYOUT_RELEASE');

-- CreateEnum
CREATE TYPE "WalletTopUpStatus" AS ENUM ('CREATING', 'PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "PayoutMethodKind" AS ENUM ('UPI', 'DEBIT_CARD');

-- CreateEnum
CREATE TYPE "PayoutMethodStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PayoutFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('DRAFT', 'READY', 'PROCESSING', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'EXCLUDED', 'REVERSED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "WalletKind" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "available_paise" BIGINT NOT NULL DEFAULT 0,
    "held_paise" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_entries" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "kind" "WalletEntryKind" NOT NULL,
    "available_delta_paise" BIGINT NOT NULL,
    "held_delta_paise" BIGINT NOT NULL,
    "available_after_paise" BIGINT NOT NULL,
    "held_after_paise" BIGINT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "ride_id" TEXT,
    "payment_id" TEXT,
    "topup_id" TEXT,
    "payout_id" TEXT,
    "reverses_entry_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_topups" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "request_key" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "provider_payment_id" TEXT,
    "status" "WalletTopUpStatus" NOT NULL DEFAULT 'CREATING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallet_topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_payout_methods" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "kind" "PayoutMethodKind" NOT NULL,
    "status" "PayoutMethodStatus" NOT NULL DEFAULT 'PENDING',
    "provider_contact_id" TEXT,
    "provider_fund_account_id" TEXT,
    "masked_label" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_payout_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_schedules" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "PayoutFrequency" NOT NULL DEFAULT 'WEEKLY',
    "minute_of_day_ist" INTEGER NOT NULL DEFAULT 0,
    "weekday_ist" INTEGER NOT NULL DEFAULT 1,
    "month_day_ist" INTEGER NOT NULL DEFAULT 1,
    "minimum_paise" BIGINT NOT NULL DEFAULT 0,
    "require_approval" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payout_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_driver_blocks" (
    "driver_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_driver_blocks_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "payout_cycles" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "cutoff_at" TIMESTAMPTZ(3) NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "schedule_snapshot" JSONB NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_payouts" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "method_id" TEXT,
    "destination_snapshot" JSONB,
    "amount_paise" BIGINT NOT NULL DEFAULT 0,
    "status" "PayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "exclusion_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_payout_lines" (
    "id" TEXT NOT NULL,
    "payout_id" TEXT NOT NULL,
    "source_entry_id" TEXT,
    "amount_paise" BIGINT NOT NULL,
    "ride_id" TEXT,
    "reference" TEXT,
    "reason" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_payout_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_payout_attempts" (
    "id" TEXT NOT NULL,
    "payout_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(36) NOT NULL,
    "provider_payout_id" TEXT,
    "utr" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'READY',
    "failure_code" TEXT,
    "next_retry_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_payout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_provider_events" (
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "wallet_provider_events_pkey" PRIMARY KEY ("provider","event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_kind_key" ON "wallets"("user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_operation_key_key" ON "wallet_entries"("operation_key");

-- CreateIndex
CREATE INDEX "wallet_entries_wallet_id_created_at_id_idx" ON "wallet_entries"("wallet_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "wallet_entries_ride_id_idx" ON "wallet_entries"("ride_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_provider_order_id_key" ON "wallet_topups"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_provider_payment_id_key" ON "wallet_topups"("provider_payment_id");

-- CreateIndex
CREATE INDEX "wallet_topups_status_updated_at_idx" ON "wallet_topups"("status", "updated_at");

-- CreateIndex
CREATE INDEX "wallet_topups_wallet_id_created_at_id_idx" ON "wallet_topups"("wallet_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_topups_wallet_id_request_key_key" ON "wallet_topups"("wallet_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payout_methods_provider_fund_account_id_key" ON "driver_payout_methods"("provider_fund_account_id");

-- CreateIndex
CREATE INDEX "driver_payout_methods_driver_id_status_idx" ON "driver_payout_methods"("driver_id", "status");

-- CreateIndex
CREATE INDEX "payout_cycles_status_scheduled_at_idx" ON "payout_cycles"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_cycles_schedule_id_cutoff_at_key" ON "payout_cycles"("schedule_id", "cutoff_at");

-- CreateIndex
CREATE INDEX "driver_payouts_wallet_id_created_at_id_idx" ON "driver_payouts"("wallet_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payouts_cycle_id_wallet_id_key" ON "driver_payouts"("cycle_id", "wallet_id");

-- CreateIndex
CREATE INDEX "driver_payout_lines_source_entry_id_idx" ON "driver_payout_lines"("source_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payout_lines_payout_id_source_entry_id_key" ON "driver_payout_lines"("payout_id", "source_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payout_attempts_idempotency_key_key" ON "driver_payout_attempts"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payout_attempts_provider_payout_id_key" ON "driver_payout_attempts"("provider_payout_id");

-- CreateIndex
CREATE INDEX "driver_payout_attempts_status_next_retry_at_idx" ON "driver_payout_attempts"("status", "next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payout_attempts_payout_id_attempt_number_key" ON "driver_payout_attempts"("payout_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_topup_id_fkey" FOREIGN KEY ("topup_id") REFERENCES "wallet_topups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "driver_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "wallet_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payout_methods" ADD CONSTRAINT "driver_payout_methods_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_driver_blocks" ADD CONSTRAINT "payout_driver_blocks_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_cycles" ADD CONSTRAINT "payout_cycles_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "payout_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payouts" ADD CONSTRAINT "driver_payouts_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "payout_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payouts" ADD CONSTRAINT "driver_payouts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payouts" ADD CONSTRAINT "driver_payouts_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "driver_payout_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payout_lines" ADD CONSTRAINT "driver_payout_lines_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "driver_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payout_lines" ADD CONSTRAINT "driver_payout_lines_source_entry_id_fkey" FOREIGN KEY ("source_entry_id") REFERENCES "wallet_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payout_attempts" ADD CONSTRAINT "driver_payout_attempts_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "driver_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Wallet balances cannot go below zero. Disputes remain separate from spendable funds.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_nonnegative_balance"
CHECK ("available_paise" >= 0 AND "held_paise" >= 0);

ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_positive_amount"
CHECK ("amount_paise" > 0);

CREATE UNIQUE INDEX "driver_payout_methods_one_default"
ON "driver_payout_methods" ("driver_id") WHERE "is_default";
