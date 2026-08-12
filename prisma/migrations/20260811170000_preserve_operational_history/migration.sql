ALTER TABLE "PatientFollowUpEvent"
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" TEXT;

ALTER TABLE "PatientPackageUsage"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "voidedAt" TIMESTAMP(3);

ALTER TABLE "LabOrderInvoice"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidReason" TEXT;

CREATE INDEX "PatientFollowUpEvent_institutionId_branchId_voidedAt_idx"
  ON "PatientFollowUpEvent"("institutionId", "branchId", "voidedAt");
CREATE INDEX "PatientPackageUsage_patientPackageId_status_idx"
  ON "PatientPackageUsage"("patientPackageId", "status");
CREATE INDEX "LabOrderInvoice_labOrderId_status_idx"
  ON "LabOrderInvoice"("labOrderId", "status");
