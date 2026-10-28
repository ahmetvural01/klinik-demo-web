-- Otomatik abonelik faturası: faturanın kapsadığı dönem. Elle kesilen
-- faturalarda boş kalır (PostgreSQL benzersiz indekste NULL'ları çakıştırmaz).
ALTER TABLE "Invoice" ADD COLUMN "periodStart" TIMESTAMP(3),
ADD COLUMN "periodEnd" TIMESTAMP(3);

CREATE UNIQUE INDEX "Invoice_institutionId_periodStart_key" ON "Invoice"("institutionId", "periodStart");
