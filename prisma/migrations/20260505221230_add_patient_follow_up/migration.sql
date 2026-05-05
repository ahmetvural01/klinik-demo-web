-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('GERI_ARA', 'ULASILAMADI', 'DONUS_BEKLENIYOR', 'DIGER');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "posId" TEXT;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "activePriceList" TEXT NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "PatientFollowUp" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "doctorId" TEXT,
    "createdById" TEXT NOT NULL,
    "type" "FollowUpType" NOT NULL DEFAULT 'GERI_ARA',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'ACIK',
    "note" TEXT,
    "resolutionNote" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "lastContactAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientFollowUp_patientId_idx" ON "PatientFollowUp"("patientId");

-- CreateIndex
CREATE INDEX "PatientFollowUp_appointmentId_idx" ON "PatientFollowUp"("appointmentId");

-- CreateIndex
CREATE INDEX "PatientFollowUp_doctorId_idx" ON "PatientFollowUp"("doctorId");

-- CreateIndex
CREATE INDEX "PatientFollowUp_createdById_idx" ON "PatientFollowUp"("createdById");

-- CreateIndex
CREATE INDEX "PatientFollowUp_status_nextActionAt_idx" ON "PatientFollowUp"("status", "nextActionAt");

-- CreateIndex
CREATE INDEX "PatientFollowUp_createdAt_idx" ON "PatientFollowUp"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_posId_idx" ON "Payment"("posId");

-- AddForeignKey
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_posId_fkey" FOREIGN KEY ("posId") REFERENCES "PosDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
