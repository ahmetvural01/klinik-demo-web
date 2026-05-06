-- CreateTable
CREATE TABLE "PatientFollowUpEvent" (
  "id" TEXT NOT NULL,
  "followUpId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "channel" TEXT,
  "summary" TEXT NOT NULL,
  "detail" TEXT,
  "patientResponse" TEXT,
  "nextStep" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientFollowUpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientFollowUpEvent_followUpId_occurredAt_idx" ON "PatientFollowUpEvent"("followUpId", "occurredAt");

-- CreateIndex
CREATE INDEX "PatientFollowUpEvent_patientId_occurredAt_idx" ON "PatientFollowUpEvent"("patientId", "occurredAt");

-- CreateIndex
CREATE INDEX "PatientFollowUpEvent_createdAt_idx" ON "PatientFollowUpEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "PatientFollowUpEvent"
ADD CONSTRAINT "PatientFollowUpEvent_followUpId_fkey"
FOREIGN KEY ("followUpId") REFERENCES "PatientFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUpEvent"
ADD CONSTRAINT "PatientFollowUpEvent_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUpEvent"
ADD CONSTRAINT "PatientFollowUpEvent_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUpEvent"
ADD CONSTRAINT "PatientFollowUpEvent_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
