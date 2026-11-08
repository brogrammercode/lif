ALTER TABLE "rides" ADD COLUMN "passenger_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "rides" ADD CONSTRAINT "rides_passenger_count_check" CHECK ("passenger_count" BETWEEN 1 AND 100);
