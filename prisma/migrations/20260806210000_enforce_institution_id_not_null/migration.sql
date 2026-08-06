-- Veri düzeltmesi: institutionId NOT NULL yapılmadan önce mevcut satırlar
-- temizlenir (bkz. denetim raporu — nullable institutionId + ghost olmayan
-- SUPERADMIN yazması, hiçbir klinikten görünmeyen "hayalet" kayıt üretebiliyordu).

-- StockMovement: institutionId'si null olan hareketler kendi StockItem'ından
-- geri doldurulur (StockItem.institutionId zaten NOT NULL yapılıyor, o yüzden
-- her satırın güvenilir bir kaynağı var).
UPDATE "StockMovement" sm
SET "institutionId" = si."institutionId"
FROM "StockItem" si
WHERE sm."stockItemId" = si.id AND sm."institutionId" IS NULL;

-- PriceItem: institutionId'si null olan satırlar hiçbir gerçek klinik
-- sorgusunda eşleşmiyordu (uygulama kodu institutionId'yi doğrudan filtre
-- olarak kullanıyor, null asla eşleşmiyor) — yalnızca SUPERADMIN'in
-- filtresiz görünümünde beliren, sahipsiz/erişilemez kayıtlardı. Hiçbir
-- kuruma ait olmadıkları için güvenle silinir.
DELETE FROM "PriceItem" WHERE "institutionId" IS NULL;

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseCategory" DROP CONSTRAINT "ExpenseCategory_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Firma" DROP CONSTRAINT "Firma_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "PatientConsent" DROP CONSTRAINT "PatientConsent_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "PosDevice" DROP CONSTRAINT "PosDevice_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "PriceItem" DROP CONSTRAINT "PriceItem_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "StockItem" DROP CONSTRAINT "StockItem_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "StockLot" DROP CONSTRAINT "StockLot_institutionId_fkey";

-- DropForeignKey
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_institutionId_fkey";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ExpenseCategory" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Firma" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PatientConsent" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PosDevice" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PriceItem" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StockItem" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StockLot" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "institutionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Waitlist" ALTER COLUMN "institutionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceItem" ADD CONSTRAINT "PriceItem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosDevice" ADD CONSTRAINT "PosDevice_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Firma" ADD CONSTRAINT "Firma_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
