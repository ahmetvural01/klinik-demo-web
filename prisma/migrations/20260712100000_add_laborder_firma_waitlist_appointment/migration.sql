-- AlterTable
ALTER TABLE "LabOrder" ADD COLUMN     "firmaId" TEXT;

-- AlterTable
ALTER TABLE "Waitlist" ADD COLUMN     "appointmentId" TEXT;

-- CreateIndex
CREATE INDEX "LabOrder_firmaId_idx" ON "LabOrder"("firmaId");

-- CreateIndex
CREATE INDEX "Waitlist_appointmentId_idx" ON "Waitlist"("appointmentId");

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: mevcut LabOrder kayıtlarını, labName ile eşleşen Firma'ya bağla
-- (kurum ve isim eşleşmesi; büyük/küçük harf duyarsız birebir eşleşme).
UPDATE "LabOrder" lo
SET "firmaId" = f.id
FROM "Firma" f, "Patient" p
WHERE lo."patientId" = p.id
  AND f.name ILIKE lo."labName"
  AND (
    (p."institutionId" IS NOT NULL AND f."institutionId" = p."institutionId")
    OR (p."institutionId" IS NULL AND f."institutionId" IS NULL)
  )
  AND lo."firmaId" IS NULL;
