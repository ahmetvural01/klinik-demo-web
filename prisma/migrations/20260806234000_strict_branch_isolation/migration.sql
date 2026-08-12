-- Branch membership is the authorization boundary inside an institution.
ALTER TABLE "UserBranch"
  ADD COLUMN "isBranchManager" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "permissionCodes" JSONB,
  ADD COLUMN "genelYuzde" DECIMAL(5,2),
  ADD COLUMN "kkYuzde" DECIMAL(5,2),
  ADD COLUMN "maasYuzde" DECIMAL(5,2);

UPDATE "UserBranch" ub
SET "isBranchManager" = (u."role" = 'YONETICI'),
    "genelYuzde" = u."genelYuzde",
    "kkYuzde" = u."kkYuzde",
    "maasYuzde" = u."maasYuzde"
FROM "User" u
WHERE u."id" = ub."userId";

-- Every operational row receives its owning branch before NOT NULL and
-- composite tenant/branch foreign keys are enabled.
ALTER TABLE "ClinicTask" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "branchId" TEXT;
ALTER TABLE "PatientPackage" ADD COLUMN "branchId" TEXT;
ALTER TABLE "StockItem" ADD COLUMN "branchId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "branchId" TEXT;
ALTER TABLE "StockLot" ADD COLUMN "branchId" TEXT;
ALTER TABLE "PosDevice" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Firma" ADD COLUMN "branchId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "branchId" TEXT;

UPDATE "ClinicTask" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "Payment" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "PatientPackage" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "StockItem" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "StockMovement" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "StockLot" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "PosDevice" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "Expense" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "Purchase" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;
UPDATE "Firma" x SET "branchId" = b."id" FROM "ClinicBranch" b WHERE b."institutionId" = x."institutionId" AND b."isHeadquarters" = true;

ALTER TABLE "Examination" ADD COLUMN "institutionId" TEXT, ADD COLUMN "branchId" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "institutionId" TEXT, ADD COLUMN "branchId" TEXT;
ALTER TABLE "TreatmentPlan" ADD COLUMN "institutionId" TEXT, ADD COLUMN "branchId" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN "institutionId" TEXT, ADD COLUMN "branchId" TEXT;
ALTER TABLE "TaksitPlan" ADD COLUMN "institutionId" TEXT, ADD COLUMN "branchId" TEXT;
ALTER TABLE "FirmaIslem" ADD COLUMN "institutionId" TEXT, ADD COLUMN "branchId" TEXT;
ALTER TABLE "DoctorRateHistory" ADD COLUMN "institutionId" TEXT, ADD COLUMN "branchId" TEXT;

UPDATE "Examination" x SET "institutionId" = p."institutionId", "branchId" = b."id" FROM "Patient" p JOIN "ClinicBranch" b ON b."institutionId" = p."institutionId" AND b."isHeadquarters" = true WHERE p."id" = x."patientId";
UPDATE "Prescription" x SET "institutionId" = p."institutionId", "branchId" = b."id" FROM "Patient" p JOIN "ClinicBranch" b ON b."institutionId" = p."institutionId" AND b."isHeadquarters" = true WHERE p."id" = x."patientId";
UPDATE "TreatmentPlan" x SET "institutionId" = p."institutionId", "branchId" = b."id" FROM "Patient" p JOIN "ClinicBranch" b ON b."institutionId" = p."institutionId" AND b."isHeadquarters" = true WHERE p."id" = x."patientId";
UPDATE "LabOrder" x SET "institutionId" = p."institutionId", "branchId" = b."id" FROM "Patient" p JOIN "ClinicBranch" b ON b."institutionId" = p."institutionId" AND b."isHeadquarters" = true WHERE p."id" = x."patientId";
UPDATE "TaksitPlan" x SET "institutionId" = p."institutionId", "branchId" = b."id" FROM "Patient" p JOIN "ClinicBranch" b ON b."institutionId" = p."institutionId" AND b."isHeadquarters" = true WHERE p."id" = x."patientId";
UPDATE "FirmaIslem" x SET "institutionId" = f."institutionId", "branchId" = b."id" FROM "Firma" f JOIN "ClinicBranch" b ON b."institutionId" = f."institutionId" AND b."isHeadquarters" = true WHERE f."id" = x."firmaId";
UPDATE "DoctorRateHistory" x SET "institutionId" = u."institutionId", "branchId" = b."id" FROM "User" u JOIN "ClinicBranch" b ON b."institutionId" = u."institutionId" AND b."isHeadquarters" = true WHERE u."id" = x."doctorId";

ALTER TABLE "ClinicTask" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "PatientPackage" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "StockItem" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "StockMovement" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "StockLot" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "PosDevice" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Firma" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Examination" ALTER COLUMN "institutionId" SET NOT NULL, ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Prescription" ALTER COLUMN "institutionId" SET NOT NULL, ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "TreatmentPlan" ALTER COLUMN "institutionId" SET NOT NULL, ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "LabOrder" ALTER COLUMN "institutionId" SET NOT NULL, ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "TaksitPlan" ALTER COLUMN "institutionId" SET NOT NULL, ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "FirmaIslem" ALTER COLUMN "institutionId" SET NOT NULL, ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "DoctorRateHistory" ALTER COLUMN "institutionId" SET NOT NULL, ALTER COLUMN "branchId" SET NOT NULL;

-- Composite keys prevent a branch id from ever being paired with another tenant.
ALTER TABLE "ClinicTask" ADD CONSTRAINT "ClinicTask_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Firma" ADD CONSTRAINT "Firma_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD CONSTRAINT "Examination_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD CONSTRAINT "Prescription_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD CONSTRAINT "TreatmentPlan_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD CONSTRAINT "LabOrder_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaksitPlan" ADD CONSTRAINT "TaksitPlan_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD CONSTRAINT "TaksitPlan_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FirmaIslem" ADD CONSTRAINT "FirmaIslem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD CONSTRAINT "FirmaIslem_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DoctorRateHistory" ADD CONSTRAINT "DoctorRateHistory_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE, ADD CONSTRAINT "DoctorRateHistory_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "StockItem_institutionId_name_key";
DROP INDEX IF EXISTS "StockMovement_institutionId_requestKey_key";
DROP INDEX IF EXISTS "PosDevice_institutionId_name_key";
DROP INDEX IF EXISTS "Expense_institutionId_sourceType_sourceId_key";
DROP INDEX IF EXISTS "FirmaIslem_firmaId_sourceType_sourceId_islemTipi_key";
DROP INDEX IF EXISTS "Firma_institutionId_name_key";
DROP INDEX IF EXISTS "ClinicTask_requestKey_key";
DROP INDEX IF EXISTS "Payment_requestKey_key";
DROP INDEX IF EXISTS "PatientPackage_requestKey_key";
DROP INDEX IF EXISTS "LabOrder_requestKey_key";
DROP INDEX IF EXISTS "Expense_requestKey_key";
DROP INDEX IF EXISTS "FirmaIslem_requestKey_key";
DROP INDEX IF EXISTS "Purchase_requestKey_key";
DROP INDEX IF EXISTS "Purchase_receiptRequestKey_key";
CREATE UNIQUE INDEX "StockItem_branchId_name_key" ON "StockItem"("branchId", "name");
CREATE UNIQUE INDEX "StockMovement_branchId_requestKey_key" ON "StockMovement"("branchId", "requestKey");
CREATE UNIQUE INDEX "PosDevice_branchId_name_key" ON "PosDevice"("branchId", "name");
CREATE UNIQUE INDEX "Expense_branchId_sourceType_sourceId_key" ON "Expense"("branchId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "FirmaIslem_branchId_firmaId_sourceType_sourceId_islemTipi_key" ON "FirmaIslem"("branchId", "firmaId", "sourceType", "sourceId", "islemTipi");
CREATE UNIQUE INDEX "Firma_branchId_name_key" ON "Firma"("branchId", "name");
CREATE INDEX "Firma_institutionId_branchId_idx" ON "Firma"("institutionId", "branchId");
CREATE INDEX "AuditLog_branchId_createdAt_idx" ON "AuditLog"("branchId", "createdAt");
CREATE UNIQUE INDEX "ClinicTask_branchId_requestKey_key" ON "ClinicTask"("branchId", "requestKey");
CREATE UNIQUE INDEX "Payment_branchId_requestKey_key" ON "Payment"("branchId", "requestKey");
CREATE UNIQUE INDEX "PatientPackage_branchId_requestKey_key" ON "PatientPackage"("branchId", "requestKey");
CREATE UNIQUE INDEX "LabOrder_branchId_requestKey_key" ON "LabOrder"("branchId", "requestKey");
CREATE UNIQUE INDEX "Expense_branchId_requestKey_key" ON "Expense"("branchId", "requestKey");
CREATE UNIQUE INDEX "FirmaIslem_branchId_requestKey_key" ON "FirmaIslem"("branchId", "requestKey");
CREATE UNIQUE INDEX "Purchase_branchId_requestKey_key" ON "Purchase"("branchId", "requestKey");
CREATE UNIQUE INDEX "Purchase_branchId_receiptRequestKey_key" ON "Purchase"("branchId", "receiptRequestKey");

CREATE INDEX "ClinicTask_institutionId_branchId_status_dueAt_idx" ON "ClinicTask"("institutionId", "branchId", "status", "dueAt");
CREATE INDEX "Payment_institutionId_branchId_status_createdAt_idx" ON "Payment"("institutionId", "branchId", "status", "createdAt");
CREATE INDEX "TreatmentPlan_institutionId_branchId_patientId_idx" ON "TreatmentPlan"("institutionId", "branchId", "patientId");
CREATE INDEX "TaksitPlan_institutionId_branchId_patientId_idx" ON "TaksitPlan"("institutionId", "branchId", "patientId");
CREATE INDEX "DoctorRateHistory_institutionId_branchId_doctorId_effectiveFrom_idx" ON "DoctorRateHistory"("institutionId", "branchId", "doctorId", "effectiveFrom");
ALTER TABLE "Waitlist" ADD COLUMN "branchId" TEXT;

UPDATE "Waitlist" AS w
SET "branchId" = p."homeBranchId"
FROM "Patient" AS p
WHERE p.id = w."patientId"
  AND p."institutionId" = w."institutionId"
  AND w."branchId" IS NULL;

UPDATE "Waitlist" AS w
SET "branchId" = b.id
FROM "ClinicBranch" AS b
WHERE b."institutionId" = w."institutionId"
  AND b."isHeadquarters" = TRUE
  AND w."branchId" IS NULL;

ALTER TABLE "Waitlist" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_branchId_institutionId_fkey"
  FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Waitlist_institutionId_branchId_idx" ON "Waitlist"("institutionId", "branchId");
ALTER TABLE "BookingRequest" ADD COLUMN "branchId" TEXT;

UPDATE "BookingRequest" AS r
SET "branchId" = b.id
FROM "ClinicBranch" AS b
WHERE b."institutionId" = r."institutionId"
  AND b."isHeadquarters" = TRUE
  AND r."branchId" IS NULL;

ALTER TABLE "BookingRequest" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_branchId_institutionId_fkey"
  FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "BookingRequest_institutionId_branchId_idx" ON "BookingRequest"("institutionId", "branchId");
