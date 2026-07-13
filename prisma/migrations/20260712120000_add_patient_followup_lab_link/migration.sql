-- AlterTable
ALTER TABLE "PatientFollowUp" ADD COLUMN     "labOrderId" TEXT,
ADD COLUMN     "labTripId" TEXT;

-- Backfill: mevcut kayıtlardaki LAB_ORDER:/LAB_PROVA: not etiketlerinden
-- gerçek kolonları doldur (legacy notlar okunabilir kalır, bkz. Tema 8).
UPDATE "PatientFollowUp"
SET "labOrderId" = substring("note" FROM 'LAB_ORDER:([a-zA-Z0-9]+)')
WHERE "note" LIKE '%LAB_ORDER:%' AND "labOrderId" IS NULL;

UPDATE "PatientFollowUp"
SET "labTripId" = substring("note" FROM 'LAB_PROVA:([a-zA-Z0-9]+)')
WHERE "note" LIKE '%LAB_PROVA:%' AND "labTripId" IS NULL;

-- Var olmayan bir LabOrder/LabTrip'e işaret eden (silinmiş kayıt) satırları
-- NULL'a çek — FK eklenmeden önce, geçersiz referans kalmasın.
UPDATE "PatientFollowUp" pf
SET "labOrderId" = NULL
WHERE pf."labOrderId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "LabOrder" lo WHERE lo.id = pf."labOrderId");

UPDATE "PatientFollowUp" pf
SET "labTripId" = NULL
WHERE pf."labTripId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "LabTrip" lt WHERE lt.id = pf."labTripId");

-- CreateIndex
CREATE INDEX "PatientFollowUp_labOrderId_idx" ON "PatientFollowUp"("labOrderId");

-- CreateIndex
CREATE INDEX "PatientFollowUp_labTripId_idx" ON "PatientFollowUp"("labTripId");

-- AddForeignKey
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_labTripId_fkey" FOREIGN KEY ("labTripId") REFERENCES "LabTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
