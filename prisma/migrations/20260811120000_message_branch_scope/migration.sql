ALTER TABLE "Message"
ADD COLUMN "institutionId" TEXT,
ADD COLUMN "branchId" TEXT;

UPDATE "Message" AS message
SET "institutionId" = app_user."institutionId"
FROM "User" AS app_user
WHERE message."userId" = app_user."id";

UPDATE "Message" AS message
SET "branchId" = COALESCE(
  (
    SELECT membership."branchId"
    FROM "UserBranch" AS membership
    INNER JOIN "ClinicBranch" AS branch ON branch."id" = membership."branchId"
    WHERE membership."userId" = message."userId"
      AND membership."institutionId" = message."institutionId"
      AND membership."isActive" = TRUE
      AND branch."isActive" = TRUE
    ORDER BY membership."isPrimary" DESC, branch."isHeadquarters" DESC, branch."sortOrder" ASC
    LIMIT 1
  ),
  (
    SELECT branch."id"
    FROM "ClinicBranch" AS branch
    WHERE branch."institutionId" = message."institutionId"
      AND branch."isActive" = TRUE
    ORDER BY branch."isHeadquarters" DESC, branch."sortOrder" ASC
    LIMIT 1
  )
);

-- Eşleştirilemeyen eski mesajları sessizce silmek yerine migration'ı durdur.
-- Operatör kullanıcı/şube ilişkisini düzelttikten sonra migration güvenle
-- yeniden çalıştırılabilir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Message"
    WHERE "institutionId" IS NULL OR "branchId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Message branch backfill tamamlanamadı; eşleştirilemeyen kayıtlar manuel olarak düzeltilmeli.';
  END IF;
END $$;

ALTER TABLE "Message"
ALTER COLUMN "institutionId" SET NOT NULL,
ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX "Message_institutionId_branchId_createdAt_idx"
ON "Message"("institutionId", "branchId", "createdAt");

ALTER TABLE "Message"
ADD CONSTRAINT "Message_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
ADD CONSTRAINT "Message_branchId_institutionId_fkey"
FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;
