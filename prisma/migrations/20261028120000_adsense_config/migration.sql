-- Klinik paneli reklamları: tek sağlayıcı Google AdSense.
-- Elle satılan reklam yapısı (Advertisement, InstitutionAdAssignment,
-- Institution.adIntensity) hiçbir ekranda gösterilmiyordu; ürün sahibinin
-- kararıyla kaldırıldı (içindeki kayıtlar yalnız test/demo verisiydi).

-- DropForeignKey
ALTER TABLE "InstitutionAdAssignment" DROP CONSTRAINT "InstitutionAdAssignment_advertisementId_fkey";

-- DropForeignKey
ALTER TABLE "InstitutionAdAssignment" DROP CONSTRAINT "InstitutionAdAssignment_institutionId_fkey";

-- DropTable
DROP TABLE "InstitutionAdAssignment";

-- DropTable
DROP TABLE "Advertisement";

-- AlterTable
ALTER TABLE "Institution" DROP COLUMN "adIntensity";

-- DropEnum
DROP TYPE "AdIntensity";

-- AlterTable: reklam varsayılan olarak her klinikte açık; süperadmin klinik
-- bazında kapatır. Platform anahtarı (PlatformAdConfig.enabled) kapalı başlar,
-- yani bu migration tek başına hiçbir klinikte reklam göstermez.
ALTER TABLE "Institution" ALTER COLUMN "adsEnabled" SET DEFAULT true;

UPDATE "Institution" SET "adsEnabled" = true;

-- CreateTable
CREATE TABLE "PlatformAdConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publisherId" TEXT NOT NULL DEFAULT '',
    "slotId" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdConfig_pkey" PRIMARY KEY ("id")
);
