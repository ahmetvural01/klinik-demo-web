ALTER TABLE "WhatsappMessage" ADD COLUMN "branchId" TEXT;

UPDATE "WhatsappMessage" message
SET "branchId" = patient."homeBranchId"
FROM "Patient" patient
WHERE message."patientId" = patient.id
  AND message."institutionId" = patient."institutionId";

UPDATE "WhatsappMessage" message
SET "branchId" = appointment."branchId"
FROM "Appointment" appointment
WHERE message."branchId" IS NULL
  AND message."appointmentId" = appointment.id
  AND message."institutionId" = appointment."institutionId";

UPDATE "WhatsappMessage" message
SET "branchId" = (
  SELECT candidate.id
  FROM "ClinicBranch" candidate
  WHERE candidate."institutionId" = message."institutionId"
  ORDER BY candidate."isHeadquarters" DESC, candidate."sortOrder" ASC, candidate."createdAt" ASC
  LIMIT 1
)
WHERE message."branchId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "WhatsappMessage" WHERE "branchId" IS NULL) THEN
    RAISE EXCEPTION 'WhatsApp message branch backfill failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "WhatsappMessage" message
    JOIN "Patient" patient ON patient.id = message."patientId"
    WHERE message."institutionId" <> patient."institutionId"
       OR message."branchId" <> patient."homeBranchId"
  ) THEN
    RAISE EXCEPTION 'WhatsApp patient scope mismatch detected';
  END IF;
END $$;

ALTER TABLE "WhatsappMessage" DROP CONSTRAINT "WhatsappMessage_appointmentId_fkey";
ALTER TABLE "WhatsappMessage" DROP CONSTRAINT "WhatsappMessage_patientId_fkey";
DROP INDEX "WhatsappMessage_institutionId_createdAt_idx";
ALTER TABLE "WhatsappMessage" ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX "WhatsappMessage_institutionId_branchId_createdAt_idx" ON "WhatsappMessage"("institutionId", "branchId", "createdAt");

ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_branchId_institutionId_fkey"
  FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_patientId_institutionId_branchId_fkey"
  FOREIGN KEY ("patientId", "institutionId", "branchId") REFERENCES "Patient"("id", "institutionId", "homeBranchId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_appointmentId_institutionId_branchId_fkey"
  FOREIGN KEY ("appointmentId", "institutionId", "branchId") REFERENCES "Appointment"("id", "institutionId", "branchId") ON DELETE NO ACTION ON UPDATE CASCADE;
