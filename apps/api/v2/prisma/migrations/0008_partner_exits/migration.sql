-- CreateEnum
CREATE TYPE "PartnerExitStatus" AS ENUM ('REQUESTED', 'REVIEWING', 'REJECTED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "PartnerApplicationStatus" ADD VALUE 'EXITED';

-- CreateTable
CREATE TABLE "partner_exit_requests" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PartnerExitStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "admin_notes" TEXT,
    "rejection_reason" TEXT,
    "dues_amount" DECIMAL(12,2),
    "dues_direction" TEXT NOT NULL DEFAULT 'SETTLED',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "settlement_pdf_id" TEXT,
    "reviewed_by_id" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "manually_shared_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_exit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_exit_requests_application_id_key" ON "partner_exit_requests"("application_id");

-- CreateIndex
CREATE INDEX "partner_exit_requests_status_created_at_idx" ON "partner_exit_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "partner_exit_requests" ADD CONSTRAINT "partner_exit_requests_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "partner_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
