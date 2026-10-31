-- Additive shared-place catalog; existing saved addresses remain unchanged.
BEGIN;
-- AlterTable
ALTER TABLE "saved_places" ADD COLUMN     "community_place_id" TEXT;

-- CreateTable
CREATE TABLE "community_places" (
    "id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "place_type" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "website" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_photos" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "author_id" TEXT,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_visits" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "visited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_reviews" (
    "id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "place_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_places_dedupe_key_key" ON "community_places"("dedupe_key");

-- CreateIndex
CREATE INDEX "community_places_created_at_id_idx" ON "community_places"("created_at", "id");

-- CreateIndex
CREATE INDEX "community_places_created_by_id_idx" ON "community_places"("created_by_id");

-- CreateIndex
CREATE INDEX "community_places_latitude_longitude_idx" ON "community_places"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "place_photos_place_id_created_at_idx" ON "place_photos"("place_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "place_photos_author_id_request_key_key" ON "place_photos"("author_id", "request_key");

-- CreateIndex
CREATE INDEX "place_visits_place_id_visited_at_idx" ON "place_visits"("place_id", "visited_at");

-- CreateIndex
CREATE INDEX "place_visits_user_id_visited_at_idx" ON "place_visits"("user_id", "visited_at");

-- CreateIndex
CREATE UNIQUE INDEX "place_visits_place_id_user_id_key" ON "place_visits"("place_id", "user_id");

-- CreateIndex
CREATE INDEX "place_reviews_place_id_created_at_idx" ON "place_reviews"("place_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "place_reviews_place_id_user_id_key" ON "place_reviews"("place_id", "user_id");

-- CreateIndex
CREATE INDEX "saved_places_community_place_id_idx" ON "saved_places"("community_place_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_places_user_id_community_place_id_key" ON "saved_places"("user_id", "community_place_id");

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_community_place_id_fkey" FOREIGN KEY ("community_place_id") REFERENCES "community_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_places" ADD CONSTRAINT "community_places_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_photos" ADD CONSTRAINT "place_photos_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "community_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_photos" ADD CONSTRAINT "place_photos_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "community_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_reviews" ADD CONSTRAINT "place_reviews_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "community_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_reviews" ADD CONSTRAINT "place_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "place_reviews" ADD CONSTRAINT "place_reviews_score_check" CHECK ("score" BETWEEN 1 AND 5);
COMMIT;
