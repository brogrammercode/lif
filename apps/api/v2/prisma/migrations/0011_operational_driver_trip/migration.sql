-- AlterTable
ALTER TABLE "driver_profiles" ADD COLUMN     "last_location_accuracy_m" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ride_fare_policies" ADD COLUMN     "arrival_radius_m" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "location_max_age_s" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "matching_expansion_s" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "matching_initial_radius_km" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "matching_max_radius_km" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "offer_lifetime_s" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "search_timeout_s" INTEGER NOT NULL DEFAULT 180;

-- AlterTable
ALTER TABLE "rides" ADD COLUMN     "next_dispatch_at" TIMESTAMPTZ(3),
ADD COLUMN     "search_radius_km" INTEGER,
ADD COLUMN     "collection_preference" "PaymentMethodType" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "collection_method" "PaymentMethodType",
ADD COLUMN     "confirmed_by_id" TEXT,
ADD COLUMN     "recipient_upi" TEXT,
ADD COLUMN     "unpaid_reason" TEXT;

-- CreateTable
CREATE TABLE "ride_start_verifications" (
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "assignment_at" TIMESTAMPTZ(3) NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_ciphertext" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "rider_confirmed_at" TIMESTAMPTZ(3),
    "driver_verified_at" TIMESTAMPTZ(3),
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ride_start_verifications_pkey" PRIMARY KEY ("ride_id")
);

-- CreateTable
CREATE TABLE "ride_messages" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "client_key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ride_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_settlement_reviews" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "reported_by_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "fee_amount" DECIMAL(12,2) NOT NULL,
    "dispute_reason" TEXT,
    "resolved_by_id" TEXT,
    "resolution_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ride_settlement_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ride_messages_ride_id_created_at_idx" ON "ride_messages"("ride_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ride_messages_ride_id_sender_id_client_key_key" ON "ride_messages"("ride_id", "sender_id", "client_key");

-- CreateIndex
CREATE UNIQUE INDEX "ride_settlement_reviews_ride_id_key" ON "ride_settlement_reviews"("ride_id");

-- CreateIndex
CREATE INDEX "ride_settlement_reviews_status_created_at_idx" ON "ride_settlement_reviews"("status", "created_at");

-- AddForeignKey
ALTER TABLE "ride_start_verifications" ADD CONSTRAINT "ride_start_verifications_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_messages" ADD CONSTRAINT "ride_messages_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_settlement_reviews" ADD CONSTRAINT "ride_settlement_reviews_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
