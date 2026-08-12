ALTER TABLE "TaksitOdeme"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "voidedAt" TIMESTAMP(3);

CREATE INDEX "TaksitOdeme_taksitId_status_idx" ON "TaksitOdeme"("taksitId", "status");
