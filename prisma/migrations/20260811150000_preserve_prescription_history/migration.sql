ALTER TABLE "Prescription"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidReason" TEXT;

CREATE INDEX "Prescription_institutionId_branchId_status_createdAt_idx"
  ON "Prescription"("institutionId", "branchId", "status", "createdAt");
