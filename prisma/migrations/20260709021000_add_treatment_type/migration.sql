-- CreateTable
CREATE TABLE "TreatmentType" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TreatmentType_institutionId_order_idx" ON "TreatmentType"("institutionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentType_institutionId_value_key" ON "TreatmentType"("institutionId", "value");

-- AddForeignKey
ALTER TABLE "TreatmentType" ADD CONSTRAINT "TreatmentType_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

