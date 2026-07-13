-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "StockMovement_stockItemId_createdAt_idx" ON "StockMovement"("stockItemId", "createdAt");

