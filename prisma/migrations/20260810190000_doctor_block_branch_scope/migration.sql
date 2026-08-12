ALTER TABLE "DoctorBlock"
ADD COLUMN "institutionId" TEXT,
ADD COLUMN "branchId" TEXT;

UPDATE "DoctorBlock" AS block
SET
  "institutionId" = doctor."institutionId",
  "branchId" = COALESCE(
    (
      SELECT membership."branchId"
      FROM "UserBranch" AS membership
      WHERE membership."userId" = block."doctorId"
        AND membership."institutionId" = doctor."institutionId"
        AND membership."isActive" = TRUE
      ORDER BY membership."isPrimary" DESC, membership."createdAt" ASC
      LIMIT 1
    ),
    (
      SELECT branch."id"
      FROM "ClinicBranch" AS branch
      WHERE branch."institutionId" = doctor."institutionId"
        AND branch."isActive" = TRUE
      ORDER BY branch."isHeadquarters" DESC, branch."sortOrder" ASC, branch."createdAt" ASC
      LIMIT 1
    )
  )
FROM "User" AS doctor
WHERE doctor."id" = block."doctorId";

-- Eşleştirilemeyen eski kayıtları sessizce silmek yerine migration'ı durdur.
-- Operatör ilgili doktor/şube ilişkisini düzelttikten sonra migration güvenle
-- yeniden çalıştırılabilir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DoctorBlock"
    WHERE "institutionId" IS NULL OR "branchId" IS NULL
  ) THEN
    RAISE EXCEPTION 'DoctorBlock branch backfill tamamlanamadı; eşleştirilemeyen kayıtlar manuel olarak düzeltilmeli.';
  END IF;
END $$;

ALTER TABLE "DoctorBlock"
ALTER COLUMN "institutionId" SET NOT NULL,
ALTER COLUMN "branchId" SET NOT NULL;

DROP INDEX IF EXISTS "DoctorBlock_doctorId_date_idx";

CREATE INDEX "DoctorBlock_institutionId_branchId_doctorId_date_idx"
ON "DoctorBlock"("institutionId", "branchId", "doctorId", "date");

ALTER TABLE "DoctorBlock"
ADD CONSTRAINT "DoctorBlock_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "Institution"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DoctorBlock"
ADD CONSTRAINT "DoctorBlock_branchId_institutionId_fkey"
FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId")
ON DELETE CASCADE ON UPDATE CASCADE;
