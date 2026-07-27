-- Foreign patients don't have a Turkish TC kimlik no; tcNo becomes optional
-- and gains an isForeigner flag plus a phoneCountryCode for non-Turkish
-- phone numbers (phone itself stays stored without the country code).
ALTER TABLE "Patient" ALTER COLUMN "tcNo" DROP NOT NULL;
ALTER TABLE "Patient" ADD COLUMN "isForeigner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN "phoneCountryCode" TEXT NOT NULL DEFAULT '+90';
