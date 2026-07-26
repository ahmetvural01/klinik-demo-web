ALTER TABLE "LabOrderInvoice"
ADD COLUMN "requestKey" TEXT;

ALTER TABLE "FirmaIslem"
ADD COLUMN "requestKey" TEXT;

ALTER TABLE "Purchase"
ADD COLUMN "requestKey" TEXT;

CREATE UNIQUE INDEX "LabOrderInvoice_requestKey_key" ON "LabOrderInvoice"("requestKey");
CREATE UNIQUE INDEX "FirmaIslem_requestKey_key" ON "FirmaIslem"("requestKey");
CREATE UNIQUE INDEX "Purchase_requestKey_key" ON "Purchase"("requestKey");
