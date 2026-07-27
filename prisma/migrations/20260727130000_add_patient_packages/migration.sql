-- CreateEnum
CREATE TYPE "PatientPackageStatus" AS ENUM ('AKTIF', 'TAMAMLANDI', 'SURESI_DOLDU', 'IPTAL');

-- CreateTable
CREATE TABLE "PackageDefinition" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "treatmentType" TEXT,
    "sessionCount" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPackage" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "definitionId" TEXT,
    "doctorId" TEXT,
    "name" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "PatientPackageStatus" NOT NULL DEFAULT 'AKTIF',
    "note" TEXT,
    "paymentId" TEXT,
    "taksitPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPackageUsage" (
    "id" TEXT NOT NULL,
    "patientPackageId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT,

    CONSTRAINT "PatientPackageUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackageDefinition_institutionId_idx" ON "PackageDefinition"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPackage_paymentId_key" ON "PatientPackage"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPackage_taksitPlanId_key" ON "PatientPackage"("taksitPlanId");

-- CreateIndex
CREATE INDEX "PatientPackage_institutionId_idx" ON "PatientPackage"("institutionId");

-- CreateIndex
CREATE INDEX "PatientPackage_patientId_idx" ON "PatientPackage"("patientId");

-- CreateIndex
CREATE INDEX "PatientPackage_status_idx" ON "PatientPackage"("status");

-- CreateIndex
CREATE INDEX "PatientPackageUsage_patientPackageId_idx" ON "PatientPackageUsage"("patientPackageId");

-- CreateIndex
CREATE INDEX "PatientPackageUsage_appointmentId_idx" ON "PatientPackageUsage"("appointmentId");

-- AddForeignKey
ALTER TABLE "PackageDefinition" ADD CONSTRAINT "PackageDefinition_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "PackageDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_taksitPlanId_fkey" FOREIGN KEY ("taksitPlanId") REFERENCES "TaksitPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageUsage" ADD CONSTRAINT "PatientPackageUsage_patientPackageId_fkey" FOREIGN KEY ("patientPackageId") REFERENCES "PatientPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageUsage" ADD CONSTRAINT "PatientPackageUsage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackageUsage" ADD CONSTRAINT "PatientPackageUsage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
