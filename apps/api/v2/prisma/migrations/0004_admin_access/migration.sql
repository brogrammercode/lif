CREATE TABLE "admin_access" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "previous_role" "UserRole" NOT NULL,
  "granted_by_id" TEXT,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_by_id" TEXT,
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "admin_access_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_access_previous_role_check" CHECK ("previous_role" <> 'ADMIN')
);
CREATE UNIQUE INDEX "admin_access_user_id_key" ON "admin_access"("user_id");
CREATE INDEX "admin_access_granted_by_id_idx" ON "admin_access"("granted_by_id");
CREATE INDEX "admin_access_revoked_by_id_idx" ON "admin_access"("revoked_by_id");
ALTER TABLE "admin_access" ADD CONSTRAINT "admin_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_access" ADD CONSTRAINT "admin_access_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_access" ADD CONSTRAINT "admin_access_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
