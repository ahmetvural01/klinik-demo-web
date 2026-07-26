ALTER TABLE "LabOrder"
ADD COLUMN "requestKey" TEXT;

CREATE UNIQUE INDEX "LabOrder_requestKey_key" ON "LabOrder"("requestKey");
