-- Preserve tenant-local identities and clinical/audit history.
DROP INDEX IF EXISTS "WhatsappMessage_externalMessageId_key";
CREATE UNIQUE INDEX "WhatsappMessage_institutionId_externalMessageId_key"
  ON "WhatsappMessage"("institutionId", "externalMessageId");

DROP INDEX IF EXISTS "PatientPackageUsage_requestKey_key";
CREATE UNIQUE INDEX "PatientPackageUsage_branchId_requestKey_key"
  ON "PatientPackageUsage"("branchId", "requestKey");

DROP INDEX IF EXISTS "LabOrderInvoice_requestKey_key";
CREATE UNIQUE INDEX "LabOrderInvoice_branchId_requestKey_key"
  ON "LabOrderInvoice"("branchId", "requestKey");

ALTER TABLE "TreatmentPlan" ADD COLUMN IF NOT EXISTS "requestKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlan_branchId_requestKey_key"
  ON "TreatmentPlan"("branchId", "requestKey");

ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "requestKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_branchId_requestKey_key"
  ON "Prescription"("branchId", "requestKey");

CREATE UNIQUE INDEX IF NOT EXISTS "Waitlist_branchId_appointmentId_key"
  ON "Waitlist"("branchId", "appointmentId");

DROP INDEX IF EXISTS "Patient_institutionId_tcNo_key";
CREATE UNIQUE INDEX "Patient_institutionId_homeBranchId_tcNo_key"
  ON "Patient"("institutionId", "homeBranchId", "tcNo");

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "SmsDispatchStatus" ADD VALUE IF NOT EXISTS 'READ';
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'IPTAL';
ALTER TABLE "SmsDispatch" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;
CREATE INDEX IF NOT EXISTS "Document_institutionId_archivedAt_idx"
  ON "Document"("institutionId", "archivedAt");

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
CREATE INDEX IF NOT EXISTS "Message_institutionId_branchId_deletedAt_createdAt_idx"
  ON "Message"("institutionId", "branchId", "deletedAt", "createdAt");

ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedById" TEXT;
CREATE INDEX IF NOT EXISTS "SupportTicket_institutionId_status_createdAt_idx"
  ON "SupportTicket"("institutionId", "status", "createdAt");

ALTER TABLE "TreatmentStep"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;
CREATE INDEX IF NOT EXISTS "TreatmentStep_planId_archivedAt_idx"
  ON "TreatmentStep"("planId", "archivedAt");

ALTER TABLE "PurchaseItem"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;
CREATE INDEX IF NOT EXISTS "PurchaseItem_purchaseId_archivedAt_idx"
  ON "PurchaseItem"("purchaseId", "archivedAt");
