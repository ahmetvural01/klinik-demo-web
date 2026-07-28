CREATE TYPE "StockLotStatus" AS ENUM ('AKTIF', 'TUKENDI', 'KARANTINA', 'IPTAL');

ALTER TABLE "PurchaseItem"
ADD COLUMN "lotNo" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "Expense"
ADD COLUMN "sourceType" TEXT,
ADD COLUMN "sourceId" TEXT;

ALTER TABLE "FirmaIslem"
ADD COLUMN "sourceType" TEXT,
ADD COLUMN "sourceId" TEXT;

CREATE TABLE "StockLot" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT,
  "stockItemId" TEXT NOT NULL,
  "purchaseItemId" TEXT,
  "lotNo" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "quantityReceived" INTEGER NOT NULL,
  "quantityRemaining" INTEGER NOT NULL,
  "unitCost" DECIMAL(10,2) NOT NULL,
  "supplierName" TEXT,
  "status" "StockLotStatus" NOT NULL DEFAULT 'AKTIF',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovementLotAllocation" (
  "id" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovementLotAllocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StockLot"
ADD CONSTRAINT "StockLot_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockLot"
ADD CONSTRAINT "StockLot_stockItemId_fkey"
FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockLot"
ADD CONSTRAINT "StockLot_purchaseItemId_fkey"
FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovementLotAllocation"
ADD CONSTRAINT "StockMovementLotAllocation_movementId_fkey"
FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovementLotAllocation"
ADD CONSTRAINT "StockMovementLotAllocation_lotId_fkey"
FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "StockLot_institutionId_stockItemId_status_idx"
ON "StockLot"("institutionId", "stockItemId", "status");

CREATE INDEX "StockLot_stockItemId_expiresAt_receivedAt_idx"
ON "StockLot"("stockItemId", "expiresAt", "receivedAt");

CREATE INDEX "StockLot_purchaseItemId_idx" ON "StockLot"("purchaseItemId");

CREATE UNIQUE INDEX "StockMovementLotAllocation_movementId_lotId_key"
ON "StockMovementLotAllocation"("movementId", "lotId");

CREATE INDEX "StockMovementLotAllocation_lotId_idx"
ON "StockMovementLotAllocation"("lotId");

CREATE UNIQUE INDEX "Expense_institutionId_sourceType_sourceId_key"
ON "Expense"("institutionId", "sourceType", "sourceId");

CREATE UNIQUE INDEX "FirmaIslem_firmaId_sourceType_sourceId_islemTipi_key"
ON "FirmaIslem"("firmaId", "sourceType", "sourceId", "islemTipi");

-- Mevcut kart bakiyeleri kaybolmasın: her pozitif stok için bir devir partisi
-- açılır. Maliyet, teslim alınmış aktif alımların ağırlıklı ortalamasından
-- hesaplanır; geçmiş alım yoksa karttaki son maliyet veya sıfır kullanılır.
INSERT INTO "StockLot" (
  "id",
  "institutionId",
  "stockItemId",
  "lotNo",
  "receivedAt",
  "expiresAt",
  "quantityReceived",
  "quantityRemaining",
  "unitCost",
  "supplierName",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_' || md5(si."id"),
  si."institutionId",
  si."id",
  'DEVIR',
  si."createdAt",
  si."expiresAt",
  si."quantity",
  si."quantity",
  COALESCE(
    (
      SELECT ROUND(
        SUM(pi."lineTotal") / NULLIF(SUM(pi."quantity"), 0),
        2
      )
      FROM "PurchaseItem" pi
      INNER JOIN "Purchase" p ON p."id" = pi."purchaseId"
      WHERE pi."stockItemId" = si."id"
        AND p."status" = 'AKTIF'
        AND p."receiptStatus" = 'TESLIM_ALINDI'
    ),
    si."unitPrice",
    0
  ),
  si."supplier",
  'AKTIF',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "StockItem" si
WHERE si."quantity" > 0;
