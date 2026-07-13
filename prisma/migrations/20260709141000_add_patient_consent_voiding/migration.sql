ALTER TABLE "PatientConsent"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'AKTIF',
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidedById" TEXT;

CREATE INDEX "PatientConsent_status_idx" ON "PatientConsent"("status");
