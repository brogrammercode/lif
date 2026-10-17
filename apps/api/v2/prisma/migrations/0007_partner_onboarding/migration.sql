-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM ('SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'CONFIRMATION_SUBMITTED', 'CONFIRMATION_CHANGES_REQUESTED', 'COMPLETED', 'ACTIVATED');

-- CreateEnum
CREATE TYPE "PartnerReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "partner_activated_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "partner_documents" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "published_title" TEXT,
    "published_html" TEXT,
    "published_version" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "contact_email" TEXT NOT NULL,
    "whatsapp_phone" TEXT NOT NULL,
    "policy_snapshot" JSONB NOT NULL,
    "confirmation_document" JSONB,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "activated_at" TIMESTAMPTZ(3),
    "final_pdf_id" TEXT,
    "activation_hash" TEXT,
    "activation_salt" TEXT,
    "activation_ciphertext" TEXT,
    "activation_attempts" INTEGER NOT NULL DEFAULT 0,
    "activation_issued_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_application_fields" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "value" JSONB NOT NULL,
    "status" "PartnerReviewStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_application_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_confirmations" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "document_snapshot" JSONB NOT NULL,
    "signature_name" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PartnerReviewStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_assets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "field_id" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_deliveries" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "claimed_at" TIMESTAMPTZ(3),
    "provider_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_documents_kind_key" ON "partner_documents"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "partner_applications_user_id_key" ON "partner_applications"("user_id");

-- CreateIndex
CREATE INDEX "partner_applications_status_submitted_at_idx" ON "partner_applications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "partner_application_fields_application_id_requirement_id_key" ON "partner_application_fields"("application_id", "requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_confirmations_application_id_key" ON "partner_confirmations"("application_id");

-- CreateIndex
CREATE INDEX "partner_assets_owner_id_purpose_idx" ON "partner_assets"("owner_id", "purpose");

-- CreateIndex
CREATE INDEX "partner_deliveries_status_updated_at_idx" ON "partner_deliveries"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "partner_deliveries_application_id_channel_key" ON "partner_deliveries"("application_id", "channel");

-- AddForeignKey
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_application_fields" ADD CONSTRAINT "partner_application_fields_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "partner_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_confirmations" ADD CONSTRAINT "partner_confirmations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "partner_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_assets" ADD CONSTRAINT "partner_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_deliveries" ADD CONSTRAINT "partner_deliveries_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "partner_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
