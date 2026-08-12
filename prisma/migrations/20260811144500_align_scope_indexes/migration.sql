-- Complete previously code-only scope/index changes. These operations do not
-- remove business data; superseded single-column indexes are replaced by the
-- institution + branch access paths used by the scoped queries.
DROP INDEX "BookingRequest_institutionId_idx";
DROP INDEX "ClinicTask_institutionId_status_dueAt_idx";
DROP INDEX "DoctorRateHistory_doctorId_effectiveFrom_idx";
DROP INDEX "Examination_patientId_diagnosedAt_idx";
DROP INDEX "Expense_institutionId_idx";
DROP INDEX "Firma_institutionId_idx";
DROP INDEX "LabOrder_patientId_idx";
DROP INDEX "PatientPackage_institutionId_idx";
DROP INDEX "Payment_institutionId_status_createdAt_idx";
DROP INDEX "PosDevice_institutionId_idx";
DROP INDEX "Prescription_patientId_idx";
DROP INDEX "Purchase_institutionId_idx";
DROP INDEX "StockItem_institutionId_idx";
DROP INDEX "StockLot_institutionId_stockItemId_status_idx";
DROP INDEX "TaksitPlan_patientId_idx";
DROP INDEX "TreatmentPlan_patientId_idx";
DROP INDEX "Waitlist_institutionId_idx";

ALTER INDEX "DoctorRateHistory_institutionId_branchId_doctorId_effectiveFrom"
  RENAME TO "DoctorRateHistory_institutionId_branchId_doctorId_effective_idx";

CREATE INDEX "Examination_institutionId_branchId_patientId_diagnosedAt_idx"
  ON "Examination"("institutionId", "branchId", "patientId", "diagnosedAt");
CREATE INDEX "Expense_institutionId_branchId_idx"
  ON "Expense"("institutionId", "branchId");
CREATE INDEX "FirmaIslem_institutionId_branchId_idx"
  ON "FirmaIslem"("institutionId", "branchId");
CREATE INDEX "LabOrder_institutionId_branchId_patientId_idx"
  ON "LabOrder"("institutionId", "branchId", "patientId");
CREATE INDEX "PatientPackage_institutionId_branchId_idx"
  ON "PatientPackage"("institutionId", "branchId");
CREATE INDEX "PosDevice_institutionId_branchId_idx"
  ON "PosDevice"("institutionId", "branchId");
CREATE INDEX "Prescription_institutionId_branchId_patientId_idx"
  ON "Prescription"("institutionId", "branchId", "patientId");
CREATE INDEX "Purchase_institutionId_branchId_idx"
  ON "Purchase"("institutionId", "branchId");
CREATE INDEX "StockItem_institutionId_branchId_idx"
  ON "StockItem"("institutionId", "branchId");
CREATE INDEX "StockLot_institutionId_branchId_stockItemId_status_idx"
  ON "StockLot"("institutionId", "branchId", "stockItemId", "status");
CREATE INDEX "StockMovement_institutionId_branchId_createdAt_idx"
  ON "StockMovement"("institutionId", "branchId", "createdAt");

ALTER TABLE "WhatsappProviderConfig" ALTER COLUMN "apiVersion" SET DEFAULT 'v25.0';
