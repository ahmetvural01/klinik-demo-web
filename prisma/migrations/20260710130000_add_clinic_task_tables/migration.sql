-- Bu migration daha once `prisma db push` ile gelistirme veritabanina
-- dogrudan uygulanmis, fakat migration gecmisine hic yazilmamisti
-- (schema.prisma'da ClinicTask/ClinicTaskAssignee modelleri vardi, ama
-- prisma/migrations altinda karsiligi yoktu). Sonuc: `prisma migrate deploy`
-- ile kurulan ortamlarda (ör. prod) bu tablolar hic olusmamis olabilir.
-- Bu dosya, gelistirme veritabanindaki gercek yapiyi migration gecmisine
-- kaydeder.

-- CreateEnum
CREATE TYPE "ClinicTaskType" AS ENUM ('PARCA_SIPARIS', 'LAB', 'ARAMA', 'EVRAK', 'DIGER');

-- CreateEnum
CREATE TYPE "ClinicTaskStatus" AS ENUM ('ACIK', 'BEKLEMEDE', 'TAMAMLANDI', 'IPTAL');

-- CreateTable
CREATE TABLE "ClinicTask" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "patientId" TEXT,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "vendorName" TEXT,
    "type" "ClinicTaskType" NOT NULL DEFAULT 'DIGER',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" "ClinicTaskStatus" NOT NULL DEFAULT 'ACIK',
    "dueAt" TIMESTAMP(3),
    "remindAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicTaskAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicTaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicTask_institutionId_status_dueAt_idx" ON "ClinicTask"("institutionId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ClinicTask_institutionId_patientId_idx" ON "ClinicTask"("institutionId", "patientId");

-- CreateIndex
CREATE INDEX "ClinicTask_assignedToId_status_idx" ON "ClinicTask"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "ClinicTaskAssignee_userId_idx" ON "ClinicTaskAssignee"("userId");

-- CreateIndex
CREATE INDEX "ClinicTaskAssignee_taskId_idx" ON "ClinicTaskAssignee"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicTaskAssignee_taskId_userId_key" ON "ClinicTaskAssignee"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "ClinicTask" ADD CONSTRAINT "ClinicTask_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTask" ADD CONSTRAINT "ClinicTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTask" ADD CONSTRAINT "ClinicTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTask" ADD CONSTRAINT "ClinicTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTaskAssignee" ADD CONSTRAINT "ClinicTaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ClinicTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicTaskAssignee" ADD CONSTRAINT "ClinicTaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
