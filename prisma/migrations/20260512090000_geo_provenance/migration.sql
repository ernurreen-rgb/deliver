ALTER TABLE "addresses"
ADD COLUMN "geoProvider" TEXT,
ADD COLUMN "geoProviderPlaceId" TEXT,
ADD COLUMN "geoSource" TEXT,
ADD COLUMN "geocodedAt" TIMESTAMP(3);

ALTER TABLE "restaurants"
ADD COLUMN "geoProvider" TEXT,
ADD COLUMN "geoProviderPlaceId" TEXT,
ADD COLUMN "geoSource" TEXT,
ADD COLUMN "geocodedAt" TIMESTAMP(3);
