-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "institutionId" TEXT;

-- Backfill: mevcut kayıtların institutionId'si, o an talebi oluşturan kullanıcının
-- kurumundan doldurulur. Bu olmadan eski destek talepleri, liste (User üzerinden)
-- ve detay (institutionId üzerinden) route'ları arasında farklı kapsam kullandığı
-- için listede görünüp detayda "bulunamadı" dönebilirdi.
UPDATE "SupportTicket" t
SET "institutionId" = u."institutionId"
FROM "User" u
WHERE t."userId" = u.id AND t."institutionId" IS NULL;

-- CreateIndex
CREATE INDEX "SupportTicket_institutionId_idx" ON "SupportTicket"("institutionId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

