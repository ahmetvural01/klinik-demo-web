-- WhatsApp QR (bağlı cihaz) oturumu ve randevu değişiklik/iptal bildirim ayarları.
-- Yalnız ekleme: yeni tablolar ve varsayılanlı yeni sütunlar; mevcut veri değişmez.
-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "appointmentCancelNotifyEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "appointmentChangeNotifyEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "WhatsappWebSession" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "credsEncrypted" TEXT,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "dailySentDate" TEXT,
    "dailySentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappWebSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappWebAuthKey" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappWebAuthKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappWebSession_institutionId_key" ON "WhatsappWebSession"("institutionId");

-- CreateIndex
CREATE INDEX "WhatsappWebAuthKey_institutionId_category_idx" ON "WhatsappWebAuthKey"("institutionId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappWebAuthKey_institutionId_category_keyId_key" ON "WhatsappWebAuthKey"("institutionId", "category", "keyId");

-- AddForeignKey
ALTER TABLE "WhatsappWebSession" ADD CONSTRAINT "WhatsappWebSession_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappWebAuthKey" ADD CONSTRAINT "WhatsappWebAuthKey_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

