CREATE TYPE "PurchaseReceiptStatus" AS ENUM ('SIPARIS_VERILDI', 'TESLIM_ALINDI');

ALTER TABLE "Purchase"
  ALTER COLUMN "firmaIslemId" DROP NOT NULL,
  ADD COLUMN "receiptRequestKey" TEXT,
  ADD COLUMN "receiptStatus" "PurchaseReceiptStatus" NOT NULL DEFAULT 'TESLIM_ALINDI',
  ADD COLUMN "receivedAt" TIMESTAMP(3);

UPDATE "Purchase"
SET "receivedAt" = "tarih"
WHERE "status" = 'AKTIF';

CREATE UNIQUE INDEX "Purchase_receiptRequestKey_key" ON "Purchase"("receiptRequestKey");
CREATE INDEX "Purchase_receiptStatus_idx" ON "Purchase"("receiptStatus");
