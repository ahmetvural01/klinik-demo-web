ALTER TABLE "Document"
ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
ADD COLUMN "sha256" TEXT;

CREATE INDEX "Document_storageProvider_idx" ON "Document"("storageProvider");
