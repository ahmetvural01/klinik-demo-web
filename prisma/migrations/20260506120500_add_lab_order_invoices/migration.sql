-- CreateTable
CREATE TABLE "LabOrderInvoice" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "invoiceNo" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabOrderInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabOrderInvoice_labOrderId_idx" ON "LabOrderInvoice"("labOrderId");

-- CreateIndex
CREATE INDEX "LabOrderInvoice_issuedAt_idx" ON "LabOrderInvoice"("issuedAt");

-- AddForeignKey
ALTER TABLE "LabOrderInvoice" ADD CONSTRAINT "LabOrderInvoice_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
