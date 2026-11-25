BEGIN;

ALTER TABLE "partner_applications" ADD COLUMN "current_user_id" TEXT;
UPDATE "partner_applications" SET "current_user_id" = "user_id";
CREATE UNIQUE INDEX "partner_applications_current_user_id_key" ON "partner_applications"("current_user_id");
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_current_user_id_fkey"
  FOREIGN KEY ("current_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_current_owner_check"
  CHECK ("current_user_id" IS NULL OR "current_user_id" = "user_id");
CREATE INDEX "partner_applications_user_id_status_created_at_id_idx"
  ON "partner_applications"("user_id", "status", "created_at", "id");

ALTER TABLE "partner_assets" ADD COLUMN "application_id" TEXT;
-- Before this migration each owner had at most one application. Assign their
-- onboarding uploads to it before permitting any new application cycle.
UPDATE "partner_assets" a SET "application_id" = p."id"
FROM "partner_applications" p
WHERE a."owner_id" = p."user_id"
  AND a."purpose" IN ('APPLICATION_DOCUMENT', 'APPLICATION_SELFIE', 'FINAL_PDF');
ALTER TABLE "partner_assets" ADD CONSTRAINT "partner_assets_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "partner_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "partner_assets_application_id_idx" ON "partner_assets"("application_id");

-- Apply the rider transition to exits completed before this release as well.
UPDATE "users" u SET
  "role" = CASE WHEN u."role" = 'DRIVER' THEN 'RIDER'::"UserRole" ELSE u."role" END,
  "partner_activated_at" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
FROM "partner_applications" p
JOIN "partner_exit_requests" e ON e."application_id" = p."id"
WHERE u."id" = p."user_id" AND p."status" = 'EXITED' AND e."status" = 'COMPLETED'
  AND (u."role" = 'DRIVER' OR u."partner_activated_at" IS NOT NULL);

DROP INDEX "partner_applications_user_id_key";
COMMIT;
