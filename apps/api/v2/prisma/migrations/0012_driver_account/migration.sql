CREATE TABLE "driver_payout_changes" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "request_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "details_ciphertext" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "rejection_reason" TEXT,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "driver_payout_changes_user_id_request_key_key" ON "driver_payout_changes"("user_id","request_key");
CREATE INDEX "driver_payout_changes_user_id_status_reviewed_at_idx" ON "driver_payout_changes"("user_id","status","reviewed_at");
CREATE UNIQUE INDEX "driver_payout_one_pending" ON "driver_payout_changes"("user_id") WHERE "status"='PENDING';
