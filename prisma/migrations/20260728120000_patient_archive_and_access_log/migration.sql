ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;

CREATE INDEX IF NOT EXISTS "Patient_institutionId_archivedAt_idx"
  ON "Patient"("institutionId", "archivedAt");

CREATE TABLE IF NOT EXISTS "PatientAccessLog" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "purpose" TEXT,
  "route" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientAccessLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientAccessLog_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientAccessLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PatientAccessLog_institutionId_createdAt_idx"
  ON "PatientAccessLog"("institutionId", "createdAt");
CREATE INDEX IF NOT EXISTS "PatientAccessLog_patientId_createdAt_idx"
  ON "PatientAccessLog"("patientId", "createdAt");
CREATE INDEX IF NOT EXISTS "PatientAccessLog_userId_createdAt_idx"
  ON "PatientAccessLog"("userId", "createdAt");
