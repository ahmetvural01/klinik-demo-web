-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "institutionId" TEXT,
ADD COLUMN     "requestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_institutionId_requestKey_key" ON "StockMovement"("institutionId", "requestKey");

