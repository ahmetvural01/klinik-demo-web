-- DropForeignKey
ALTER TABLE "BirthdaySmsLog" DROP CONSTRAINT "BirthdaySmsLog_patientId_fkey";

-- DropForeignKey
ALTER TABLE "CelebrationSmsLog" DROP CONSTRAINT "CelebrationSmsLog_patientId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicTaskAssignee" DROP CONSTRAINT "ClinicTaskAssignee_taskId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicTaskAssignee" DROP CONSTRAINT "ClinicTaskAssignee_userId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "FirmaKontakt" DROP CONSTRAINT "FirmaKontakt_firmaId_fkey";

-- DropForeignKey
ALTER TABLE "FirmaPaymentAllocation" DROP CONSTRAINT "FirmaPaymentAllocation_debtIslemId_fkey";

-- DropForeignKey
ALTER TABLE "FirmaPaymentAllocation" DROP CONSTRAINT "FirmaPaymentAllocation_firmaId_fkey";

-- DropForeignKey
ALTER TABLE "FirmaPaymentAllocation" DROP CONSTRAINT "FirmaPaymentAllocation_paymentIslemId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceReminder" DROP CONSTRAINT "InvoiceReminder_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "LabOrderInvoice" DROP CONSTRAINT "LabOrderInvoice_labOrderId_fkey";

-- DropForeignKey
ALTER TABLE "LabTrip" DROP CONSTRAINT "LabTrip_labOrderId_fkey";

-- DropForeignKey
ALTER TABLE "PatientAccessLog" DROP CONSTRAINT "PatientAccessLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "PatientConsent" DROP CONSTRAINT "PatientConsent_createdById_fkey";

-- DropForeignKey
ALTER TABLE "PatientFollowUp" DROP CONSTRAINT "PatientFollowUp_createdById_fkey";

-- DropForeignKey
ALTER TABLE "PatientFollowUp" DROP CONSTRAINT "PatientFollowUp_labTripId_fkey";

-- DropForeignKey
ALTER TABLE "PatientFollowUpEvent" DROP CONSTRAINT "PatientFollowUpEvent_createdById_fkey";

-- DropForeignKey
ALTER TABLE "PatientFollowUpEvent" DROP CONSTRAINT "PatientFollowUpEvent_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "PatientPackageUsage" DROP CONSTRAINT "PatientPackageUsage_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "PatientPackageUsage" DROP CONSTRAINT "PatientPackageUsage_createdById_fkey";

-- DropForeignKey
ALTER TABLE "PatientPackageUsage" DROP CONSTRAINT "PatientPackageUsage_patientPackageId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRevision" DROP CONSTRAINT "PaymentRevision_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseItem" DROP CONSTRAINT "PurchaseItem_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseItem" DROP CONSTRAINT "PurchaseItem_stockItemId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseItem" DROP CONSTRAINT "PurchaseItem_stockMovementId_fkey";

-- DropForeignKey
ALTER TABLE "StockLot" DROP CONSTRAINT "StockLot_purchaseItemId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovementLotAllocation" DROP CONSTRAINT "StockMovementLotAllocation_lotId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovementLotAllocation" DROP CONSTRAINT "StockMovementLotAllocation_movementId_fkey";

-- DropForeignKey
ALTER TABLE "Taksit" DROP CONSTRAINT "Taksit_planId_fkey";

-- DropForeignKey
ALTER TABLE "TaksitOdeme" DROP CONSTRAINT "TaksitOdeme_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "TaksitOdeme" DROP CONSTRAINT "TaksitOdeme_posId_fkey";

-- DropForeignKey
ALTER TABLE "TaksitOdeme" DROP CONSTRAINT "TaksitOdeme_taksitId_fkey";

-- DropForeignKey
ALTER TABLE "TreatmentStep" DROP CONSTRAINT "TreatmentStep_planId_fkey";

-- DropForeignKey
ALTER TABLE "WhatsappTemplate" DROP CONSTRAINT "WhatsappTemplate_providerId_fkey";

-- AlterTable
ALTER TABLE "BirthdaySmsLog" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "CelebrationSmsLog" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "ClinicTaskAssignee" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "FirmaKontakt" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "FirmaPaymentAllocation" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceReminder" ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "LabOrderInvoice" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "LabTrip" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "PatientPackageUsage" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "PaymentRevision" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "StockMovementLotAllocation" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "Taksit" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "TaksitOdeme" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "TreatmentStep" ADD COLUMN "branchId" TEXT, ADD COLUMN "institutionId" TEXT;

-- AlterTable
ALTER TABLE "WhatsappTemplate" ADD COLUMN "institutionId" TEXT;

UPDATE "BirthdaySmsLog" x SET "institutionId" = p."institutionId", "branchId" = p."homeBranchId" FROM "Patient" p WHERE p.id = x."patientId";
UPDATE "CelebrationSmsLog" x SET "institutionId" = p."institutionId", "branchId" = p."homeBranchId" FROM "Patient" p WHERE p.id = x."patientId";
UPDATE "ClinicTaskAssignee" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "ClinicTask" p WHERE p.id = x."taskId";
UPDATE "FirmaKontakt" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "Firma" p WHERE p.id = x."firmaId";
UPDATE "FirmaPaymentAllocation" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "Firma" p WHERE p.id = x."firmaId";
UPDATE "InvoiceReminder" x SET "institutionId" = p."institutionId" FROM "Invoice" p WHERE p.id = x."invoiceId";
UPDATE "LabOrderInvoice" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "LabOrder" p WHERE p.id = x."labOrderId";
UPDATE "LabTrip" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "LabOrder" p WHERE p.id = x."labOrderId";
UPDATE "PatientPackageUsage" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "PatientPackage" p WHERE p.id = x."patientPackageId";
UPDATE "PaymentRevision" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "Payment" p WHERE p.id = x."paymentId";
UPDATE "PurchaseItem" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "Purchase" p WHERE p.id = x."purchaseId";
UPDATE "StockMovementLotAllocation" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "StockMovement" p WHERE p.id = x."movementId";
UPDATE "Taksit" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "TaksitPlan" p WHERE p.id = x."planId";
UPDATE "TaksitOdeme" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "Taksit" p WHERE p.id = x."taksitId";
UPDATE "TreatmentStep" x SET "institutionId" = p."institutionId", "branchId" = p."branchId" FROM "TreatmentPlan" p WHERE p.id = x."planId";
UPDATE "WhatsappTemplate" x SET "institutionId" = p."institutionId" FROM "WhatsappProviderConfig" p WHERE p.id = x."providerId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "BirthdaySmsLog" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "CelebrationSmsLog" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "ClinicTaskAssignee" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "FirmaKontakt" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "FirmaPaymentAllocation" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "InvoiceReminder" WHERE "institutionId" IS NULL)
    OR EXISTS (SELECT 1 FROM "LabOrderInvoice" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "LabTrip" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "PatientPackageUsage" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "PaymentRevision" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "PurchaseItem" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "StockMovementLotAllocation" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "Taksit" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "TaksitOdeme" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "TreatmentStep" WHERE "institutionId" IS NULL OR "branchId" IS NULL)
    OR EXISTS (SELECT 1 FROM "WhatsappTemplate" WHERE "institutionId" IS NULL)
    OR EXISTS (SELECT 1 FROM "ClinicTaskAssignee" x JOIN "User" u ON u.id=x."userId" WHERE x."institutionId" IS DISTINCT FROM u."institutionId")
    OR EXISTS (SELECT 1 FROM "PatientPackageUsage" x JOIN "Appointment" a ON a.id=x."appointmentId" WHERE x."appointmentId" IS NOT NULL AND (x."institutionId", x."branchId") IS DISTINCT FROM (a."institutionId", a."branchId"))
    OR EXISTS (SELECT 1 FROM "PurchaseItem" x JOIN "StockItem" s ON s.id=x."stockItemId" WHERE (x."institutionId", x."branchId") IS DISTINCT FROM (s."institutionId", s."branchId"))
    OR EXISTS (SELECT 1 FROM "PurchaseItem" x JOIN "StockMovement" s ON s.id=x."stockMovementId" WHERE x."stockMovementId" IS NOT NULL AND (x."institutionId", x."branchId") IS DISTINCT FROM (s."institutionId", s."branchId"))
    OR EXISTS (SELECT 1 FROM "StockMovementLotAllocation" x JOIN "StockLot" s ON s.id=x."lotId" WHERE (x."institutionId", x."branchId") IS DISTINCT FROM (s."institutionId", s."branchId"))
    OR EXISTS (SELECT 1 FROM "TaksitOdeme" x JOIN "Payment" p ON p.id=x."paymentId" WHERE x."paymentId" IS NOT NULL AND (x."institutionId", x."branchId") IS DISTINCT FROM (p."institutionId", p."branchId"))
    OR EXISTS (SELECT 1 FROM "TaksitOdeme" x JOIN "PosDevice" p ON p.id=x."posId" WHERE x."posId" IS NOT NULL AND (x."institutionId", x."branchId") IS DISTINCT FROM (p."institutionId", p."branchId"))
    OR EXISTS (SELECT 1 FROM "FirmaPaymentAllocation" x JOIN "FirmaIslem" p ON p.id IN (x."paymentIslemId", x."debtIslemId") WHERE (x."institutionId", x."branchId") IS DISTINCT FROM (p."institutionId", p."branchId"))
  THEN RAISE EXCEPTION 'Operational child scope preflight failed';
  END IF;
END $$;

ALTER TABLE "BirthdaySmsLog" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "CelebrationSmsLog" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "ClinicTaskAssignee" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "FirmaKontakt" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "FirmaPaymentAllocation" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "InvoiceReminder" ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "LabOrderInvoice" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "LabTrip" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "PatientPackageUsage" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "PaymentRevision" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "PurchaseItem" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "StockMovementLotAllocation" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "Taksit" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "TaksitOdeme" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "TreatmentStep" ALTER COLUMN "branchId" SET NOT NULL, ALTER COLUMN "institutionId" SET NOT NULL;
ALTER TABLE "WhatsappTemplate" ALTER COLUMN "institutionId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ClinicTask_id_institutionId_branchId_key" ON "ClinicTask"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_id_institutionId_key" ON "Invoice"("id", "institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "LabOrderInvoice_id_institutionId_branchId_key" ON "LabOrderInvoice"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "LabTrip_id_institutionId_branchId_key" ON "LabTrip"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPackage_id_institutionId_branchId_key" ON "PatientPackage"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_id_institutionId_branchId_key" ON "Purchase"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseItem_id_institutionId_branchId_key" ON "PurchaseItem"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseItem_stockMovementId_institutionId_branchId_key" ON "PurchaseItem"("stockMovementId", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_id_institutionId_branchId_key" ON "StockLot"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_id_institutionId_branchId_key" ON "StockMovement"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Taksit_id_institutionId_branchId_key" ON "Taksit"("id", "institutionId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlan_id_institutionId_branchId_key" ON "TreatmentPlan"("id", "institutionId", "branchId");

-- CreateIndex
CREATE INDEX "WhatsappTemplate_institutionId_idx" ON "WhatsappTemplate"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappTemplate_id_institutionId_key" ON "WhatsappTemplate"("id", "institutionId");

-- AddForeignKey
ALTER TABLE "WhatsappTemplate" ADD CONSTRAINT "WhatsappTemplate_providerId_institutionId_fkey" FOREIGN KEY ("providerId", "institutionId") REFERENCES "WhatsappProviderConfig"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappTemplate" ADD CONSTRAINT "WhatsappTemplate_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReminder" ADD CONSTRAINT "InvoiceReminder_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReminder" ADD CONSTRAINT "InvoiceReminder_invoiceId_institutionId_fkey" FOREIGN KEY ("invoiceId", "institutionId") REFERENCES "Invoice"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAccessLog" ADD CONSTRAINT "PatientAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTaskAssignee" ADD CONSTRAINT "ClinicTaskAssignee_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTaskAssignee" ADD CONSTRAINT "ClinicTaskAssignee_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTaskAssignee" ADD CONSTRAINT "ClinicTaskAssignee_taskId_institutionId_branchId_fkey" FOREIGN KEY ("taskId", "institutionId", "branchId") REFERENCES "ClinicTask"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTaskAssignee" ADD CONSTRAINT "ClinicTaskAssignee_userId_institutionId_fkey" FOREIGN KEY ("userId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_labTripId_institutionId_branchId_fkey" FOREIGN KEY ("labTripId", "institutionId", "branchId") REFERENCES "LabTrip"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUpEvent" ADD CONSTRAINT "PatientFollowUpEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUpEvent" ADD CONSTRAINT "PatientFollowUpEvent_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRevision" ADD CONSTRAINT "PaymentRevision_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRevision" ADD CONSTRAINT "PaymentRevision_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRevision" ADD CONSTRAINT "PaymentRevision_paymentId_institutionId_branchId_fkey" FOREIGN KEY ("paymentId", "institutionId", "branchId") REFERENCES "Payment"("id", "institutionId", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentStep" ADD CONSTRAINT "TreatmentStep_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentStep" ADD CONSTRAINT "TreatmentStep_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentStep" ADD CONSTRAINT "TreatmentStep_planId_institutionId_branchId_fkey" FOREIGN KEY ("planId", "institutionId", "branchId") REFERENCES "TreatmentPlan"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageUsage" ADD CONSTRAINT "PatientPackageUsage_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageUsage" ADD CONSTRAINT "PatientPackageUsage_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageUsage" ADD CONSTRAINT "PatientPackageUsage_patientPackageId_institutionId_branchI_fkey" FOREIGN KEY ("patientPackageId", "institutionId", "branchId") REFERENCES "PatientPackage"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageUsage" ADD CONSTRAINT "PatientPackageUsage_appointmentId_institutionId_branchId_fkey" FOREIGN KEY ("appointmentId", "institutionId", "branchId") REFERENCES "Appointment"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageUsage" ADD CONSTRAINT "PatientPackageUsage_createdById_institutionId_fkey" FOREIGN KEY ("createdById", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTrip" ADD CONSTRAINT "LabTrip_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTrip" ADD CONSTRAINT "LabTrip_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTrip" ADD CONSTRAINT "LabTrip_labOrderId_institutionId_branchId_fkey" FOREIGN KEY ("labOrderId", "institutionId", "branchId") REFERENCES "LabOrder"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderInvoice" ADD CONSTRAINT "LabOrderInvoice_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderInvoice" ADD CONSTRAINT "LabOrderInvoice_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderInvoice" ADD CONSTRAINT "LabOrderInvoice_labOrderId_institutionId_branchId_fkey" FOREIGN KEY ("labOrderId", "institutionId", "branchId") REFERENCES "LabOrder"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_purchaseItemId_institutionId_branchId_fkey" FOREIGN KEY ("purchaseItemId", "institutionId", "branchId") REFERENCES "PurchaseItem"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLotAllocation" ADD CONSTRAINT "StockMovementLotAllocation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLotAllocation" ADD CONSTRAINT "StockMovementLotAllocation_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLotAllocation" ADD CONSTRAINT "StockMovementLotAllocation_movementId_institutionId_branch_fkey" FOREIGN KEY ("movementId", "institutionId", "branchId") REFERENCES "StockMovement"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementLotAllocation" ADD CONSTRAINT "StockMovementLotAllocation_lotId_institutionId_branchId_fkey" FOREIGN KEY ("lotId", "institutionId", "branchId") REFERENCES "StockLot"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taksit" ADD CONSTRAINT "Taksit_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taksit" ADD CONSTRAINT "Taksit_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taksit" ADD CONSTRAINT "Taksit_planId_institutionId_branchId_fkey" FOREIGN KEY ("planId", "institutionId", "branchId") REFERENCES "TaksitPlan"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitOdeme" ADD CONSTRAINT "TaksitOdeme_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitOdeme" ADD CONSTRAINT "TaksitOdeme_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitOdeme" ADD CONSTRAINT "TaksitOdeme_paymentId_institutionId_branchId_fkey" FOREIGN KEY ("paymentId", "institutionId", "branchId") REFERENCES "Payment"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitOdeme" ADD CONSTRAINT "TaksitOdeme_posId_institutionId_branchId_fkey" FOREIGN KEY ("posId", "institutionId", "branchId") REFERENCES "PosDevice"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitOdeme" ADD CONSTRAINT "TaksitOdeme_taksitId_institutionId_branchId_fkey" FOREIGN KEY ("taksitId", "institutionId", "branchId") REFERENCES "Taksit"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdaySmsLog" ADD CONSTRAINT "BirthdaySmsLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdaySmsLog" ADD CONSTRAINT "BirthdaySmsLog_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdaySmsLog" ADD CONSTRAINT "BirthdaySmsLog_patientId_institutionId_branchId_fkey" FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CelebrationSmsLog" ADD CONSTRAINT "CelebrationSmsLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CelebrationSmsLog" ADD CONSTRAINT "CelebrationSmsLog_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CelebrationSmsLog" ADD CONSTRAINT "CelebrationSmsLog_patientId_institutionId_branchId_fkey" FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaPaymentAllocation" ADD CONSTRAINT "FirmaPaymentAllocation_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaPaymentAllocation" ADD CONSTRAINT "FirmaPaymentAllocation_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaPaymentAllocation" ADD CONSTRAINT "FirmaPaymentAllocation_firmaId_institutionId_branchId_fkey" FOREIGN KEY ("firmaId", "institutionId", "branchId") REFERENCES "Firma"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaPaymentAllocation" ADD CONSTRAINT "FirmaPaymentAllocation_paymentIslemId_institutionId_branch_fkey" FOREIGN KEY ("paymentIslemId", "institutionId", "branchId") REFERENCES "FirmaIslem"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaPaymentAllocation" ADD CONSTRAINT "FirmaPaymentAllocation_debtIslemId_institutionId_branchId_fkey" FOREIGN KEY ("debtIslemId", "institutionId", "branchId") REFERENCES "FirmaIslem"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaKontakt" ADD CONSTRAINT "FirmaKontakt_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaKontakt" ADD CONSTRAINT "FirmaKontakt_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaKontakt" ADD CONSTRAINT "FirmaKontakt_firmaId_institutionId_branchId_fkey" FOREIGN KEY ("firmaId", "institutionId", "branchId") REFERENCES "Firma"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_institutionId_branchId_fkey" FOREIGN KEY ("purchaseId", "institutionId", "branchId") REFERENCES "Purchase"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_stockItemId_institutionId_branchId_fkey" FOREIGN KEY ("stockItemId", "institutionId", "branchId") REFERENCES "StockItem"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_stockMovementId_institutionId_branchId_fkey" FOREIGN KEY ("stockMovementId", "institutionId", "branchId") REFERENCES "StockMovement"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
