ALTER TABLE "payout_schedules"
  ADD COLUMN "next_run_at" TIMESTAMPTZ(3),
  ADD COLUMN "replaced_run_at" TIMESTAMPTZ(3);
