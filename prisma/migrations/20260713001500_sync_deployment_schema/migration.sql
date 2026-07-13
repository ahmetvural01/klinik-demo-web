-- CreateEnum
CREATE TYPE "FirmaKategori" AS ENUM ('TEDARICI', 'HIZMET_SAGLAYICI', 'LAB', 'KONTRAKTOR', 'BANK', 'DIGER');

-- CreateEnum
CREATE TYPE "PaymentTermType" AS ENUM ('COD', 'NET_15', 'NET_30', 'NET_60', 'NET_90', 'NET_120', 'EOM', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_patientId_fkey";

-- DropForeignKey
ALTER TABLE "Reminder" DROP CONSTRAINT "Reminder_planId_fkey";

-- DropIndex
DROP INDEX "ExpenseCategory_name_key";

-- DropIndex
DROP INDEX "Firma_name_key";

-- DropIndex
DROP INDEX "Patient_tcNo_key";

-- DropIndex
DROP INDEX "PosDevice_name_key";

-- DropIndex
DROP INDEX "PriceItem_code_treatment_key";

-- DropIndex
DROP INDEX "User_identityNo_key";

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "doctorId" TEXT,
ADD COLUMN     "periodMonth" INTEGER,
ADD COLUMN     "periodYear" INTEGER;

-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN     "isDoctorPayout" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Firma" ADD COLUMN     "customPaymentDays" INTEGER,
ADD COLUMN     "kategori" "FirmaKategori" NOT NULL DEFAULT 'TEDARICI',
ADD COLUMN     "paymentTerms" "PaymentTermType" DEFAULT 'NET_30',
ADD COLUMN     "scoreUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "vendorScore" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "dailySchedules" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "lunchEnd" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lunchStart" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SiteContent" ALTER COLUMN "heroDescription" SET DEFAULT 'Hasta kayıt, randevu planlama, tedavi takibi, ödeme yönetimi, SMS/e-posta hatırlatma ve raporlama modüllerini bir arada sunar.';

-- AlterTable
ALTER TABLE "SmtpConfig" ALTER COLUMN "fromName" SET DEFAULT 'Klinik Yönetim Paneli',
ALTER COLUMN "fromEmail" SET DEFAULT 'noreply@klinik.local';

-- AlterTable
ALTER TABLE "TaksitOdeme" ADD COLUMN     "paymentId" TEXT;

-- CreateTable
CREATE TABLE "DoctorBlock" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmaKontakt" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "unvan" TEXT,
    "email" TEXT,
    "telefon" TEXT,
    "rol" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmaKontakt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "firmaId" TEXT NOT NULL,
    "firmaIslemId" TEXT NOT NULL,
    "tarih" TIMESTAMP(3) NOT NULL,
    "faturaNo" TEXT,
    "aciklama" TEXT,
    "kdvOrani" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'adet',
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "stockMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorBlock_doctorId_date_idx" ON "DoctorBlock"("doctorId", "date");

-- CreateIndex
CREATE INDEX "FirmaKontakt_firmaId_idx" ON "FirmaKontakt"("firmaId");

-- CreateIndex
CREATE INDEX "FirmaKontakt_email_idx" ON "FirmaKontakt"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_firmaIslemId_key" ON "Purchase"("firmaIslemId");

-- CreateIndex
CREATE INDEX "Purchase_institutionId_idx" ON "Purchase"("institutionId");

-- CreateIndex
CREATE INDEX "Purchase_firmaId_idx" ON "Purchase"("firmaId");

-- CreateIndex
CREATE INDEX "Purchase_tarih_idx" ON "Purchase"("tarih");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseItem_stockMovementId_key" ON "PurchaseItem"("stockMovementId");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_stockItemId_idx" ON "PurchaseItem"("stockItemId");

-- CreateIndex
CREATE INDEX "Expense_doctorId_periodYear_periodMonth_idx" ON "Expense"("doctorId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "Firma_kategori_idx" ON "Firma"("kategori");

-- CreateIndex
CREATE INDEX "Firma_vendorScore_idx" ON "Firma"("vendorScore");

-- CreateIndex
CREATE UNIQUE INDEX "LabOrderInvoice_labOrderId_invoiceNo_key" ON "LabOrderInvoice"("labOrderId", "invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "LabTrip_labOrderId_order_key" ON "LabTrip"("labOrderId", "order");

-- CreateIndex
CREATE INDEX "Message_userId_idx" ON "Message"("userId");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "Prescription_doctorId_idx" ON "Prescription"("doctorId");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "TaksitOdeme_paymentId_idx" ON "TaksitOdeme"("paymentId");

-- CreateIndex
CREATE INDEX "TreatmentStep_planId_idx" ON "TreatmentStep"("planId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorBlock" ADD CONSTRAINT "DoctorBlock_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitOdeme" ADD CONSTRAINT "TaksitOdeme_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaKontakt" ADD CONSTRAINT "FirmaKontakt_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_firmaIslemId_fkey" FOREIGN KEY ("firmaIslemId") REFERENCES "FirmaIslem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TaksitPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

