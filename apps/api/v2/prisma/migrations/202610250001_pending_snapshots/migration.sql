CREATE TABLE "admin_pending_snapshots" (
  "key" TEXT PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "vehicle_models_status_idx" ON "vehicle_models"("status");
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");
CREATE INDEX "partner_application_fields_status_application_id_idx" ON "partner_application_fields"("status", "application_id");
