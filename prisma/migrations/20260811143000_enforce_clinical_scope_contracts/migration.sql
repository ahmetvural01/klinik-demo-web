-- Scope is persisted on operational records so tenant/branch ownership does
-- not depend on a join chosen by each caller.
ALTER TABLE "PatientFollowUp" ADD COLUMN "institutionId" TEXT;
ALTER TABLE "PatientFollowUp" ADD COLUMN "branchId" TEXT;
ALTER TABLE "PatientFollowUpEvent" ADD COLUMN "institutionId" TEXT;
ALTER TABLE "PatientFollowUpEvent" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Reminder" ADD COLUMN "institutionId" TEXT;
ALTER TABLE "Reminder" ADD COLUMN "branchId" TEXT;
ALTER TABLE "SmsDispatch" ADD COLUMN "branchId" TEXT;

UPDATE "PatientFollowUp" f
SET "institutionId" = p."institutionId", "branchId" = p."homeBranchId"
FROM "Patient" p
WHERE p.id = f."patientId";

UPDATE "PatientFollowUpEvent" e
SET "institutionId" = f."institutionId", "branchId" = f."branchId"
FROM "PatientFollowUp" f
WHERE f.id = e."followUpId";

UPDATE "Reminder" r
SET "institutionId" = source."institutionId", "branchId" = source."branchId"
FROM (
  SELECT r2.id,
         COALESCE(p."institutionId", tp."institutionId") AS "institutionId",
         COALESCE(p."homeBranchId", tp."branchId") AS "branchId"
  FROM "Reminder" r2
  LEFT JOIN "Patient" p ON p.id = r2."patientId"
  LEFT JOIN "TaksitPlan" tp ON tp.id = r2."planId"
) source
WHERE source.id = r.id;

UPDATE "SmsDispatch" d
SET "branchId" = p."homeBranchId"
FROM "Patient" p
WHERE p.id = d."patientId" AND p."institutionId" = d."institutionId";

-- Never repair ownership silently. A mismatch means an operator must inspect
-- the source record before this migration can continue.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "PatientFollowUp"
    WHERE "institutionId" IS NULL OR "branchId" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "PatientFollowUpEvent"
    WHERE "institutionId" IS NULL OR "branchId" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "Reminder"
    WHERE "institutionId" IS NULL OR "branchId" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "SmsDispatch"
    WHERE "branchId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Clinical scope backfill failed: orphaned operational records exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Reminder" r
    JOIN "Patient" p ON p.id = r."patientId"
    JOIN "TaksitPlan" tp ON tp.id = r."planId"
    WHERE (p."institutionId", p."homeBranchId", p.id)
      IS DISTINCT FROM (tp."institutionId", tp."branchId", tp."patientId")
  ) THEN
    RAISE EXCEPTION 'Clinical scope backfill failed: reminder patient and plan differ';
  END IF;
END $$;

ALTER TABLE "PatientFollowUp" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "PatientFollowUp" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "PatientFollowUpEvent" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "PatientFollowUpEvent" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Reminder" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "Reminder" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "SmsDispatch" ALTER COLUMN "branchId" SET NOT NULL;

CREATE UNIQUE INDEX "Patient_id_institutionId_homeBranchId_key"
  ON "Patient"("id", "institutionId", "homeBranchId");
CREATE UNIQUE INDEX "ClinicUnit_id_institutionId_branchId_key"
  ON "ClinicUnit"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "Appointment_id_institutionId_branchId_key"
  ON "Appointment"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "Payment_id_institutionId_branchId_key"
  ON "Payment"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "TaksitPlan_id_institutionId_branchId_key"
  ON "TaksitPlan"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "LabOrder_id_institutionId_branchId_key"
  ON "LabOrder"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "StockItem_id_institutionId_branchId_key"
  ON "StockItem"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "PosDevice_id_institutionId_branchId_key"
  ON "PosDevice"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "Firma_id_institutionId_branchId_key"
  ON "Firma"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "FirmaIslem_id_institutionId_branchId_key"
  ON "FirmaIslem"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "PatientFollowUp_id_institutionId_branchId_key"
  ON "PatientFollowUp"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "PatientPackage_paymentId_institutionId_branchId_key"
  ON "PatientPackage"("paymentId", "institutionId", "branchId");
CREATE UNIQUE INDEX "PatientPackage_taksitPlanId_institutionId_branchId_key"
  ON "PatientPackage"("taksitPlanId", "institutionId", "branchId");
CREATE UNIQUE INDEX "Purchase_firmaIslemId_institutionId_branchId_key"
  ON "Purchase"("firmaIslemId", "institutionId", "branchId");

CREATE INDEX "PatientFollowUp_institutionId_branchId_status_nextActionAt_idx"
  ON "PatientFollowUp"("institutionId", "branchId", "status", "nextActionAt");
CREATE INDEX "PatientFollowUpEvent_institutionId_branchId_occurredAt_idx"
  ON "PatientFollowUpEvent"("institutionId", "branchId", "occurredAt");
CREATE INDEX "Reminder_institutionId_branchId_status_reminderDate_idx"
  ON "Reminder"("institutionId", "branchId", "status", "reminderDate");
CREATE INDEX "SmsDispatch_institutionId_branchId_createdAt_idx"
  ON "SmsDispatch"("institutionId", "branchId", "createdAt");

ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_clinicUnitId_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_patientId_fkey";
ALTER TABLE "ClinicTask" DROP CONSTRAINT "ClinicTask_patientId_fkey";
ALTER TABLE "Examination" DROP CONSTRAINT "Examination_patientId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_patientId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_posId_fkey";
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_patientId_fkey";
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT "TreatmentPlan_patientId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT "PatientPackage_patientId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT "PatientPackage_paymentId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT "PatientPackage_taksitPlanId_fkey";
ALTER TABLE "LabOrder" DROP CONSTRAINT "LabOrder_firmaId_fkey";
ALTER TABLE "LabOrder" DROP CONSTRAINT "LabOrder_patientId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_stockItemId_fkey";
ALTER TABLE "StockLot" DROP CONSTRAINT "StockLot_stockItemId_fkey";
ALTER TABLE "TaksitPlan" DROP CONSTRAINT "TaksitPlan_patientId_fkey";
ALTER TABLE "FirmaIslem" DROP CONSTRAINT "FirmaIslem_firmaId_fkey";
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_firmaId_fkey";
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_firmaIslemId_fkey";
ALTER TABLE "PatientFollowUp" DROP CONSTRAINT "PatientFollowUp_appointmentId_fkey";
ALTER TABLE "PatientFollowUp" DROP CONSTRAINT "PatientFollowUp_labOrderId_fkey";
ALTER TABLE "PatientFollowUp" DROP CONSTRAINT "PatientFollowUp_patientId_fkey";
ALTER TABLE "PatientFollowUpEvent" DROP CONSTRAINT "PatientFollowUpEvent_followUpId_fkey";
ALTER TABLE "PatientFollowUpEvent" DROP CONSTRAINT "PatientFollowUpEvent_patientId_fkey";
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_patientId_fkey";
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_planId_fkey";
ALTER TABLE "SmsDispatch" DROP CONSTRAINT "SmsDispatch_patientId_fkey";
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_patientId_fkey";
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_appointmentId_fkey";

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicUnitId_institutionId_branchId_fkey"
  FOREIGN KEY ("clinicUnitId", "institutionId", "branchId") REFERENCES "ClinicUnit"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "ClinicTask" ADD CONSTRAINT "ClinicTask_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_posId_institutionId_branchId_fkey"
  FOREIGN KEY ("posId", "institutionId", "branchId") REFERENCES "PosDevice"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_paymentId_institutionId_branchId_fkey"
  FOREIGN KEY ("paymentId", "institutionId", "branchId") REFERENCES "Payment"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_taksitPlanId_institutionId_branchId_fkey"
  FOREIGN KEY ("taksitPlanId", "institutionId", "branchId") REFERENCES "TaksitPlan"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_firmaId_institutionId_branchId_fkey"
  FOREIGN KEY ("firmaId", "institutionId", "branchId") REFERENCES "Firma"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_institutionId_branchId_fkey"
  FOREIGN KEY ("stockItemId", "institutionId", "branchId") REFERENCES "StockItem"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_stockItemId_institutionId_branchId_fkey"
  FOREIGN KEY ("stockItemId", "institutionId", "branchId") REFERENCES "StockItem"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "TaksitPlan" ADD CONSTRAINT "TaksitPlan_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "FirmaIslem" ADD CONSTRAINT "FirmaIslem_firmaId_institutionId_branchId_fkey"
  FOREIGN KEY ("firmaId", "institutionId", "branchId") REFERENCES "Firma"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_firmaId_institutionId_branchId_fkey"
  FOREIGN KEY ("firmaId", "institutionId", "branchId") REFERENCES "Firma"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_firmaIslemId_institutionId_branchId_fkey"
  FOREIGN KEY ("firmaIslemId", "institutionId", "branchId") REFERENCES "FirmaIslem"("id", "institutionId", "branchId") ON UPDATE CASCADE;

ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_branchId_institutionId_fkey"
  FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_appointmentId_institutionId_branchId_fkey"
  FOREIGN KEY ("appointmentId", "institutionId", "branchId") REFERENCES "Appointment"("id", "institutionId", "branchId") ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_labOrderId_institutionId_branchId_fkey"
  FOREIGN KEY ("labOrderId", "institutionId", "branchId") REFERENCES "LabOrder"("id", "institutionId", "branchId") ON UPDATE CASCADE;

ALTER TABLE "PatientFollowUpEvent" ADD CONSTRAINT "PatientFollowUpEvent_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUpEvent" ADD CONSTRAINT "PatientFollowUpEvent_branchId_institutionId_fkey"
  FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUpEvent" ADD CONSTRAINT "PatientFollowUpEvent_followUpId_institutionId_branchId_fkey"
  FOREIGN KEY ("followUpId", "institutionId", "branchId") REFERENCES "PatientFollowUp"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUpEvent" ADD CONSTRAINT "PatientFollowUpEvent_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_branchId_institutionId_fkey"
  FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_planId_institutionId_branchId_fkey"
  FOREIGN KEY ("planId", "institutionId", "branchId") REFERENCES "TaksitPlan"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SmsDispatch" ADD CONSTRAINT "SmsDispatch_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsDispatch" ADD CONSTRAINT "SmsDispatch_branchId_institutionId_fkey"
  FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON UPDATE CASCADE;
ALTER TABLE "SmsDispatch" ADD CONSTRAINT "SmsDispatch_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_appointmentId_institutionId_branchId_fkey"
  FOREIGN KEY ("appointmentId", "institutionId", "branchId") REFERENCES "Appointment"("id", "institutionId", "branchId") ON UPDATE CASCADE;
