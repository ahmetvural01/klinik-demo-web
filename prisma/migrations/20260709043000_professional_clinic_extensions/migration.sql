-- Professional clinic extensions: consent records, inventory traceability, supplier due dates.

ALTER TABLE "StockItem"
ADD COLUMN "barcode" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "storageLocation" TEXT;

ALTER TABLE "FirmaIslem"
ADD COLUMN "dueDate" TIMESTAMP(3);

CREATE TABLE "ConsentTemplate" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'TEDAVI_ONAM',
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientConsent" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT,
  "patientId" TEXT NOT NULL,
  "templateId" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'TEDAVI_ONAM',
  "body" TEXT NOT NULL,
  "signerName" TEXT NOT NULL,
  "signerIdentityNo" TEXT,
  "signatureDataUrl" TEXT NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockItem_barcode_idx" ON "StockItem"("barcode");
CREATE INDEX "StockItem_expiresAt_idx" ON "StockItem"("expiresAt");
CREATE INDEX "FirmaIslem_dueDate_idx" ON "FirmaIslem"("dueDate");
CREATE INDEX "ConsentTemplate_institutionId_isActive_idx" ON "ConsentTemplate"("institutionId", "isActive");
CREATE INDEX "ConsentTemplate_category_idx" ON "ConsentTemplate"("category");
CREATE INDEX "PatientConsent_institutionId_idx" ON "PatientConsent"("institutionId");
CREATE INDEX "PatientConsent_patientId_signedAt_idx" ON "PatientConsent"("patientId", "signedAt");
CREATE INDEX "PatientConsent_templateId_idx" ON "PatientConsent"("templateId");

ALTER TABLE "ConsentTemplate"
ADD CONSTRAINT "ConsentTemplate_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatientConsent"
ADD CONSTRAINT "PatientConsent_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatientConsent"
ADD CONSTRAINT "PatientConsent_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PatientConsent"
ADD CONSTRAINT "PatientConsent_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "ConsentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PatientConsent"
ADD CONSTRAINT "PatientConsent_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
