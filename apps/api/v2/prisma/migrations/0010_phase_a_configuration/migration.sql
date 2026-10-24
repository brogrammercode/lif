CREATE TYPE "FareGroup" AS ENUM ('AUTO_TOTO', 'BIKE_SCOOTER', 'CAR');

CREATE TABLE "ride_fare_policies" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "cash_enabled" BOOLEAN NOT NULL DEFAULT true,
  "direct_upi_enabled" BOOLEAN NOT NULL DEFAULT true,
  "online_payment_enabled" BOOLEAN NOT NULL DEFAULT false,
  "commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "free_cancellation_minutes" INTEGER NOT NULL DEFAULT 2,
  "free_pickup_wait_minutes" INTEGER NOT NULL DEFAULT 5,
  "cancellation_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 10,
  "maximum_cancellation_fee" DECIMAL(12,2) NOT NULL DEFAULT 100,
  "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ride_fare_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ride_fare_policies_key_key" ON "ride_fare_policies"("key");

CREATE TABLE "ride_fare_rates" (
  "id" TEXT NOT NULL,
  "policy_id" TEXT NOT NULL,
  "group" "FareGroup" NOT NULL,
  "max_profit_km" DECIMAL(12,3) NOT NULL,
  "normal_fare_per_km" DECIMAL(12,2) NOT NULL,
  "profit_fare_per_km" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "ride_fare_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ride_fare_rates_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "ride_fare_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ride_fare_rates_policy_id_group_key" ON "ride_fare_rates"("policy_id", "group");

CREATE TABLE "support_contact_configurations" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "support_phone" TEXT,
  "emergency_phone" TEXT,
  "whatsapp_phone" TEXT,
  "support_email" TEXT,
  "support_hours" TEXT,
  "instructions" TEXT,
  "updated_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "support_contact_configurations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_contact_configurations_key_key" ON "support_contact_configurations"("key");
