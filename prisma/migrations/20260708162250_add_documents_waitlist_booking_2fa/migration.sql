-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('BELGE', 'RONTGEN', 'FOTOGRAF');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('BEKLIYOR', 'ARANDI', 'YERLESTIRILDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "BookingRequestStatus" AS ENUM ('BEKLIYOR', 'ONAYLANDI', 'REDDEDILDI', 'IPTAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorBackupCodes" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "patientId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'BELGE',
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "toothNo" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "createdById" TEXT NOT NULL,
    "preferredFrom" TIMESTAMP(3),
    "preferredTo" TIMESTAMP(3),
    "note" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "doctorId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "tcNo" TEXT,
    "preferredFrom" TIMESTAMP(3) NOT NULL,
    "preferredTo" TIMESTAMP(3),
    "note" TEXT,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "createdAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_storedName_key" ON "Document"("storedName");

-- CreateIndex
CREATE INDEX "Document_patientId_idx" ON "Document"("patientId");

-- CreateIndex
CREATE INDEX "Document_institutionId_idx" ON "Document"("institutionId");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE INDEX "Waitlist_institutionId_idx" ON "Waitlist"("institutionId");

-- CreateIndex
CREATE INDEX "Waitlist_status_idx" ON "Waitlist"("status");

-- CreateIndex
CREATE INDEX "Waitlist_patientId_idx" ON "Waitlist"("patientId");

-- CreateIndex
CREATE INDEX "BookingRequest_institutionId_idx" ON "BookingRequest"("institutionId");

-- CreateIndex
CREATE INDEX "BookingRequest_status_idx" ON "BookingRequest"("status");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

