-- Aynı tahsilat isteğinin ağ tekrarı veya çift tıklama nedeniyle iki kez
-- kaydedilmesini veritabanı seviyesinde engeller.
ALTER TABLE "Payment" ADD COLUMN "requestKey" TEXT;

CREATE UNIQUE INDEX "Payment_requestKey_key" ON "Payment"("requestKey");
