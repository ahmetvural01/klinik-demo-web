-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('NORMAL', 'LIMITED', 'READ_ONLY', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdIntensity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('AKTIF', 'TAMAMLANDI');

-- CreateEnum
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('PLANLANDI', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('DEVAM_EDIYOR', 'HASTAYA_TAKILDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "TaksitPeriod" AS ENUM ('HAFTALIK', 'IKIHALFTALIK', 'AYLIK', 'IKIAYLIK', 'UCAYLIK', 'ALTIAYLIK', 'YILLIK');

-- CreateEnum
CREATE TYPE "TaksitPlanStatus" AS ENUM ('AKTIF', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "TaksitStatus" AS ENUM ('BEKLIYOR', 'ODENDI', 'GECIKTI', 'IPTAL');

-- CreateEnum
CREATE TYPE "FirmaIslemTipi" AS ENUM ('ALIM', 'HIZMET', 'ODEME');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'MAIL_ORDER';

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "adIntensity" "AdIntensity" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "adsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxActiveDoctors" INTEGER,
ADD COLUMN     "maxActiveUsers" INTEGER,
ADD COLUMN     "paymentGraceUntil" TIMESTAMP(3),
ADD COLUMN     "serviceMode" "ServiceMode" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "serviceNote" TEXT,
ADD COLUMN     "suspendedUntil" TIMESTAMP(3),
ADD COLUMN     "throttleMs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "genelYuzde" DECIMAL(5,2),
ADD COLUMN     "kkYuzde" DECIMAL(5,2),
ADD COLUMN     "maasYuzde" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "Advertisement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "ctaText" TEXT,
    "ctaUrl" TEXT,
    "sponsorName" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "maxImpressions" INTEGER,
    "dailyCap" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionAdAssignment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "advertisementId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionAdAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceReminder" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "errorDetail" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmtpConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT 'Klinik Modern',
    "fromEmail" TEXT NOT NULL DEFAULT 'noreply@klinikmodern.com',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmtpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteContent" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "heroBadge" TEXT NOT NULL DEFAULT 'Dis Hekimi Klinikleri Icin Uretildi',
    "heroTitle" TEXT NOT NULL DEFAULT 'Randevudan kasaya, tum surecler tek bir profesyonel sistemde.',
    "heroDescription" TEXT NOT NULL DEFAULT 'KlinikModern; hasta kayıt, randevu planlama, tedavi takibi, ödeme yönetimi, SMS/e-posta hatırlatma ve raporlama modüllerini bir arada sunar.',
    "primaryCtaLabel" TEXT NOT NULL DEFAULT 'Hemen Giris Yap',
    "primaryCtaUrl" TEXT NOT NULL DEFAULT '/klinik/giris',
    "secondaryCtaLabel" TEXT NOT NULL DEFAULT 'Fiyatlari Incele',
    "secondaryCtaUrl" TEXT NOT NULL DEFAULT '#fiyatlar',
    "promoTitle" TEXT NOT NULL DEFAULT 'Program Demo ve Tanitim Talebi',
    "promoDescription" TEXT NOT NULL DEFAULT 'Kliniğinize özel senaryo üzerinden canlı tanıtım alarak modülleri gerçek kullanım akışında görebilirsiniz.',
    "promoVideoUrl" TEXT,
    "heroImageUrl" TEXT,
    "featureCards" JSONB NOT NULL,
    "pricingCards" JSONB NOT NULL,
    "statsCards" JSONB NOT NULL,
    "moduleCards" JSONB NOT NULL,
    "galleryImages" JSONB NOT NULL,
    "showAnimations" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperadminPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperadminPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'PLANLANDI',
    "totalCost" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "treatmentName" TEXT NOT NULL,
    "toothNo" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "doneAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "labName" TEXT NOT NULL,
    "labType" TEXT NOT NULL,
    "teeth" TEXT,
    "notes" TEXT,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'DEVAM_EDIYOR',
    "price" DECIMAL(10,2),
    "invoiceNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTrip" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "sentNote" TEXT,
    "receivedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SARF',
    "unit" TEXT NOT NULL DEFAULT 'adet',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 5,
    "unitPrice" DECIMAL(10,2),
    "supplier" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaksitPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "baslik" TEXT,
    "toplamBorc" DECIMAL(10,2) NOT NULL,
    "pesnat" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taksitSayisi" INTEGER NOT NULL,
    "period" "TaksitPeriod" NOT NULL DEFAULT 'AYLIK',
    "startDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "TaksitPlanStatus" NOT NULL DEFAULT 'AKTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaksitPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Taksit" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "siraNo" INTEGER NOT NULL,
    "vadeDate" TIMESTAMP(3) NOT NULL,
    "tutar" DECIMAL(10,2) NOT NULL,
    "odenen" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "kalan" DECIMAL(10,2) NOT NULL,
    "status" "TaksitStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Taksit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaksitOdeme" (
    "id" TEXT NOT NULL,
    "taksitId" TEXT NOT NULL,
    "tarih" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tutar" DECIMAL(10,2) NOT NULL,
    "yontem" "PaymentMethod" NOT NULL DEFAULT 'NAKIT',
    "posId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaksitOdeme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tarih" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "tutar" DECIMAL(10,2) NOT NULL,
    "yontem" "PaymentMethod" NOT NULL DEFAULT 'NAKIT',
    "faturaNo" TEXT,
    "kdvOrani" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Firma" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "iban" TEXT,
    "ibanName" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Firma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmaIslem" (
    "id" TEXT NOT NULL,
    "firmaId" TEXT NOT NULL,
    "tarih" TIMESTAMP(3) NOT NULL,
    "islemTipi" "FirmaIslemTipi" NOT NULL DEFAULT 'ALIM',
    "urunHizmet" TEXT,
    "aciklama" TEXT,
    "tutar" DECIMAL(10,2) NOT NULL,
    "faturaNo" TEXT,
    "yontem" "PaymentMethod",
    "kdvOrani" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmaIslem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "planId" TEXT,
    "note" TEXT NOT NULL,
    "reminderDate" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'AKTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Advertisement_isActive_priority_idx" ON "Advertisement"("isActive", "priority");

-- CreateIndex
CREATE INDEX "InstitutionAdAssignment_institutionId_isActive_idx" ON "InstitutionAdAssignment"("institutionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionAdAssignment_institutionId_advertisementId_key" ON "InstitutionAdAssignment"("institutionId", "advertisementId");

-- CreateIndex
CREATE INDEX "InvoiceReminder_invoiceId_idx" ON "InvoiceReminder"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SuperadminPermission_userId_key" ON "SuperadminPermission"("userId");

-- CreateIndex
CREATE INDEX "TreatmentPlan_patientId_idx" ON "TreatmentPlan"("patientId");

-- CreateIndex
CREATE INDEX "TreatmentPlan_doctorId_idx" ON "TreatmentPlan"("doctorId");

-- CreateIndex
CREATE INDEX "LabOrder_patientId_idx" ON "LabOrder"("patientId");

-- CreateIndex
CREATE INDEX "LabOrder_doctorId_idx" ON "LabOrder"("doctorId");

-- CreateIndex
CREATE INDEX "LabTrip_labOrderId_idx" ON "LabTrip"("labOrderId");

-- CreateIndex
CREATE INDEX "TaksitPlan_patientId_idx" ON "TaksitPlan"("patientId");

-- CreateIndex
CREATE INDEX "TaksitPlan_doctorId_idx" ON "TaksitPlan"("doctorId");

-- CreateIndex
CREATE INDEX "TaksitPlan_status_idx" ON "TaksitPlan"("status");

-- CreateIndex
CREATE INDEX "Taksit_planId_idx" ON "Taksit"("planId");

-- CreateIndex
CREATE INDEX "Taksit_vadeDate_idx" ON "Taksit"("vadeDate");

-- CreateIndex
CREATE INDEX "Taksit_status_idx" ON "Taksit"("status");

-- CreateIndex
CREATE INDEX "TaksitOdeme_taksitId_idx" ON "TaksitOdeme"("taksitId");

-- CreateIndex
CREATE UNIQUE INDEX "PosDevice_name_key" ON "PosDevice"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "Expense_tarih_idx" ON "Expense"("tarih");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Firma_name_key" ON "Firma"("name");

-- CreateIndex
CREATE INDEX "FirmaIslem_firmaId_idx" ON "FirmaIslem"("firmaId");

-- CreateIndex
CREATE INDEX "FirmaIslem_tarih_idx" ON "FirmaIslem"("tarih");

-- CreateIndex
CREATE INDEX "Reminder_reminderDate_idx" ON "Reminder"("reminderDate");

-- CreateIndex
CREATE INDEX "Reminder_status_idx" ON "Reminder"("status");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_idx" ON "Appointment"("doctorId");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_startAt_idx" ON "Appointment"("doctorId", "startAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Examination_patientId_idx" ON "Examination"("patientId");

-- CreateIndex
CREATE INDEX "Examination_doctorId_idx" ON "Examination"("doctorId");

-- CreateIndex
CREATE INDEX "Invoice_institutionId_idx" ON "Invoice"("institutionId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "Invoice_institutionId_status_idx" ON "Invoice"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Patient_fullName_idx" ON "Patient"("fullName");

-- CreateIndex
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");

-- CreateIndex
CREATE INDEX "Payment_patientId_idx" ON "Payment"("patientId");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "SmsTransaction_institutionId_idx" ON "SmsTransaction"("institutionId");

-- CreateIndex
CREATE INDEX "SmsTransaction_createdAt_idx" ON "SmsTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "InstitutionAdAssignment" ADD CONSTRAINT "InstitutionAdAssignment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionAdAssignment" ADD CONSTRAINT "InstitutionAdAssignment_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReminder" ADD CONSTRAINT "InvoiceReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperadminPermission" ADD CONSTRAINT "SuperadminPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentStep" ADD CONSTRAINT "TreatmentStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTrip" ADD CONSTRAINT "LabTrip_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitPlan" ADD CONSTRAINT "TaksitPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitPlan" ADD CONSTRAINT "TaksitPlan_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taksit" ADD CONSTRAINT "Taksit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TaksitPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitOdeme" ADD CONSTRAINT "TaksitOdeme_taksitId_fkey" FOREIGN KEY ("taksitId") REFERENCES "Taksit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaksitOdeme" ADD CONSTRAINT "TaksitOdeme_posId_fkey" FOREIGN KEY ("posId") REFERENCES "PosDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmaIslem" ADD CONSTRAINT "FirmaIslem_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TaksitPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
