-- Core tenant scoping for SaaS data isolation.
-- Columns are nullable during the transition so existing local/demo data is preserved.

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "institutionId" TEXT;
ALTER TABLE "PriceItem" ADD COLUMN IF NOT EXISTS "institutionId" TEXT;
ALTER TABLE "StockItem" ADD COLUMN IF NOT EXISTS "institutionId" TEXT;
ALTER TABLE "PosDevice" ADD COLUMN IF NOT EXISTS "institutionId" TEXT;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "institutionId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "institutionId" TEXT;
ALTER TABLE "Firma" ADD COLUMN IF NOT EXISTS "institutionId" TEXT;

WITH first_institution AS (
  SELECT id FROM "Institution" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Patient" p
SET "institutionId" = COALESCE(
  (
    SELECT u."institutionId"
    FROM "Appointment" a
    JOIN "User" u ON u.id = a."doctorId"
    WHERE a."patientId" = p.id AND u."institutionId" IS NOT NULL
    ORDER BY a."createdAt" DESC
    LIMIT 1
  ),
  (
    SELECT u."institutionId"
    FROM "Examination" e
    JOIN "User" u ON u.id = e."doctorId"
    WHERE e."patientId" = p.id AND u."institutionId" IS NOT NULL
    ORDER BY e."createdAt" DESC
    LIMIT 1
  ),
  (SELECT id FROM first_institution)
)
WHERE p."institutionId" IS NULL;

WITH first_institution AS (
  SELECT id FROM "Institution" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "PriceItem" SET "institutionId" = (SELECT id FROM first_institution)
WHERE "institutionId" IS NULL;

WITH first_institution AS (
  SELECT id FROM "Institution" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "StockItem" SET "institutionId" = (SELECT id FROM first_institution)
WHERE "institutionId" IS NULL;

WITH first_institution AS (
  SELECT id FROM "Institution" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "PosDevice" SET "institutionId" = (SELECT id FROM first_institution)
WHERE "institutionId" IS NULL;

WITH first_institution AS (
  SELECT id FROM "Institution" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "ExpenseCategory" SET "institutionId" = (SELECT id FROM first_institution)
WHERE "institutionId" IS NULL;

WITH first_institution AS (
  SELECT id FROM "Institution" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Expense" SET "institutionId" = (SELECT id FROM first_institution)
WHERE "institutionId" IS NULL;

WITH first_institution AS (
  SELECT id FROM "Institution" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Firma" SET "institutionId" = (SELECT id FROM first_institution)
WHERE "institutionId" IS NULL;

ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_tcNo_key";
ALTER TABLE "PriceItem" DROP CONSTRAINT IF EXISTS "PriceItem_code_treatment_key";
ALTER TABLE "PosDevice" DROP CONSTRAINT IF EXISTS "PosDevice_name_key";
ALTER TABLE "ExpenseCategory" DROP CONSTRAINT IF EXISTS "ExpenseCategory_name_key";
ALTER TABLE "Firma" DROP CONSTRAINT IF EXISTS "Firma_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Patient_institutionId_tcNo_key" ON "Patient"("institutionId", "tcNo");
CREATE INDEX IF NOT EXISTS "Patient_institutionId_idx" ON "Patient"("institutionId");

CREATE UNIQUE INDEX IF NOT EXISTS "PriceItem_institutionId_code_treatment_key" ON "PriceItem"("institutionId", "code", "treatment");
CREATE INDEX IF NOT EXISTS "PriceItem_institutionId_idx" ON "PriceItem"("institutionId");

CREATE INDEX IF NOT EXISTS "StockItem_institutionId_idx" ON "StockItem"("institutionId");

CREATE UNIQUE INDEX IF NOT EXISTS "PosDevice_institutionId_name_key" ON "PosDevice"("institutionId", "name");
CREATE INDEX IF NOT EXISTS "PosDevice_institutionId_idx" ON "PosDevice"("institutionId");

CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseCategory_institutionId_name_key" ON "ExpenseCategory"("institutionId", "name");
CREATE INDEX IF NOT EXISTS "ExpenseCategory_institutionId_idx" ON "ExpenseCategory"("institutionId");

CREATE INDEX IF NOT EXISTS "Expense_institutionId_idx" ON "Expense"("institutionId");

CREATE UNIQUE INDEX IF NOT EXISTS "Firma_institutionId_name_key" ON "Firma"("institutionId", "name");
CREATE INDEX IF NOT EXISTS "Firma_institutionId_idx" ON "Firma"("institutionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Patient_institutionId_fkey') THEN
    ALTER TABLE "Patient" ADD CONSTRAINT "Patient_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceItem_institutionId_fkey') THEN
    ALTER TABLE "PriceItem" ADD CONSTRAINT "PriceItem_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockItem_institutionId_fkey') THEN
    ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PosDevice_institutionId_fkey') THEN
    ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpenseCategory_institutionId_fkey') THEN
    ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_institutionId_fkey') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Firma_institutionId_fkey') THEN
    ALTER TABLE "Firma" ADD CONSTRAINT "Firma_institutionId_fkey"
      FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
