-- Patient.homeBranchId nullable idi — bir hasta şubesiz kalırsa, şube bazlı
-- filtrelenen HER ekrandan (liste, detay, randevu, belge, taksit, vs.)
-- görünmez/erişilemez hale geliyordu ("hayalet hasta", bkz. denetim raporu —
-- institutionId'de daha önce yaşanan aynı sınıf hata). Var olan NULL kayıtlar
-- kurumun merkez şubesine (yoksa ilk aktif şubeye) atanarak kapatılıyor.

UPDATE "Patient" p
SET "homeBranchId" = coalesce(
  (SELECT b.id FROM "ClinicBranch" b WHERE b."institutionId" = p."institutionId" AND b."isHeadquarters" = true ORDER BY b."createdAt" ASC LIMIT 1),
  (SELECT b.id FROM "ClinicBranch" b WHERE b."institutionId" = p."institutionId" ORDER BY b."createdAt" ASC LIMIT 1)
)
WHERE p."homeBranchId" IS NULL;

-- AlterTable
ALTER TABLE "Patient" ALTER COLUMN "homeBranchId" SET NOT NULL;
