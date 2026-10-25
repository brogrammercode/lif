-- Preserve each existing category's effective fare before retiring the former
-- three-group configuration. This mapping is migration-only, never a fallback.
BEGIN;
SELECT pg_advisory_xact_lock(720041);
SELECT pg_advisory_xact_lock(720051);
ALTER TABLE "vehicle_categories"
  ADD COLUMN "max_profit_km" DECIMAL(12,3),
  ADD COLUMN "normal_fare_per_km" DECIMAL(12,2),
  ADD COLUMN "profit_fare_per_km" DECIMAL(12,2);

UPDATE "vehicle_categories" AS c
SET "max_profit_km" = r."max_profit_km",
    "normal_fare_per_km" = r."normal_fare_per_km",
    "profit_fare_per_km" = r."profit_fare_per_km",
    "updated_at" = CURRENT_TIMESTAMP
FROM "ride_fare_rates" AS r
JOIN "ride_fare_policies" AS p ON p."id" = r."policy_id" AND p."key" = 'default'
WHERE r."group"::text = CASE
  WHEN c."vehicle_type"::text = 'AUTO' THEN 'AUTO_TOTO'
  WHEN c."vehicle_type"::text IN ('BIKE', 'SCOOTER') THEN 'BIKE_SCOOTER'
  WHEN c."vehicle_type"::text IN ('SEDAN', 'SUV') THEN 'CAR'
END;

ALTER TABLE "vehicle_categories" ADD CONSTRAINT "category_fare_complete"
CHECK (("max_profit_km" IS NULL AND "normal_fare_per_km" IS NULL AND "profit_fare_per_km" IS NULL)
  OR ("max_profit_km" BETWEEN 0 AND 100000
      AND "normal_fare_per_km" BETWEEN 0 AND 1000000
      AND "profit_fare_per_km" BETWEEN 0 AND 1000000
      AND "max_profit_km" IS NOT NULL AND "normal_fare_per_km" IS NOT NULL AND "profit_fare_per_km" IS NOT NULL));

-- Retain archived group rows so older deployments remain readable during rollout.
-- New runtime code never consults them. Quote JSON and accepted amounts are untouched.
COMMIT;
