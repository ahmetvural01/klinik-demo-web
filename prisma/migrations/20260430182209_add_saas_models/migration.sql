/*
  Warnings:

  - You are about to drop the column `institution` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[institutionId]` on the table `Setting` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[institutionId,identityNo]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `institutionId` to the `Setting` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPERADMIN';

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_patientId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'BEKLIYOR';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "bloodType" TEXT,
ADD COLUMN     "toothChart" TEXT;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "patientId" DROP NOT NULL,
ALTER COLUMN "method" SET DEFAULT 'NAKIT';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "institutionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "institutionId" TEXT,
ALTER COLUMN "role" SET DEFAULT 'DOKTOR';

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "taxNo" TEXT,
    "registryNo" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER',
    "smsBalance" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "smsCount" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsTransaction" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "smsPackageId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "drugs" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- Seed default institution and backfill foreign keys for existing rows
INSERT INTO "Institution" ("id", "name", "email", "createdAt", "updatedAt")
SELECT 'inst-default', 'whitedental', 'info@whitedental.local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Institution");

UPDATE "User"
SET "institutionId" = 'inst-default'
WHERE "institutionId" IS NULL;

UPDATE "Setting"
SET "institutionId" = 'inst-default'
WHERE "institutionId" IS NULL;

-- Keep legacy institution column until data is backfilled, then drop it.
ALTER TABLE "User" DROP COLUMN "institution";

-- Enforce NOT NULL after backfill
ALTER TABLE "Setting" ALTER COLUMN "institutionId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_key" ON "Institution"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_email_key" ON "Institution"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_taxNo_key" ON "Institution"("taxNo");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_ownerId_key" ON "Institution"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsPackage_smsCount_key" ON "SmsPackage"("smsCount");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_institutionId_key" ON "Setting"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_institutionId_identityNo_key" ON "User"("institutionId", "identityNo");

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsTransaction" ADD CONSTRAINT "SmsTransaction_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
