ALTER TABLE "sessions" ADD COLUMN "family_id" TEXT;

UPDATE "sessions" SET "family_id" = "id" WHERE "user_agent" LIKE '[admin]%';

CREATE INDEX "sessions_family_id_revoked_at_idx" ON "sessions"("family_id", "revoked_at");
