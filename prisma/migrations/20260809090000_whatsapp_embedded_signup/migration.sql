-- Professional Meta WhatsApp Cloud API connection lifecycle.
CREATE TYPE "WhatsappConnectionStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR', 'DISCONNECTED');

ALTER TABLE "WhatsappProviderConfig"
  ADD COLUMN "businessId" TEXT,
  ADD COLUMN "displayPhoneNumber" TEXT,
  ADD COLUMN "verifiedName" TEXT,
  ADD COLUMN "accessTokenEncrypted" TEXT,
  ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "connectionStatus" "WhatsappConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
  ADD COLUMN "connectionError" TEXT,
  ADD COLUMN "connectedAt" TIMESTAMP(3),
  ADD COLUMN "disconnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastWebhookAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessfulSendAt" TIMESTAMP(3);

UPDATE "WhatsappProviderConfig"
SET "connectionStatus" = CASE WHEN "isActive" THEN 'CONNECTED'::"WhatsappConnectionStatus" ELSE 'DISCONNECTED'::"WhatsappConnectionStatus" END,
    "connectedAt" = CASE WHEN "isActive" THEN "updatedAt" ELSE NULL END;

DROP INDEX IF EXISTS "WhatsappProviderConfig_phoneNumberId_idx";
WITH duplicate_numbers AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "phoneNumberId" ORDER BY "updatedAt" DESC, "id") AS row_no
  FROM "WhatsappProviderConfig"
  WHERE "phoneNumberId" IS NOT NULL
)
UPDATE "WhatsappProviderConfig" AS provider
SET "phoneNumberId" = NULL,
    "isActive" = false,
    "connectionStatus" = 'ERROR'::"WhatsappConnectionStatus",
    "connectionError" = 'Aynı Meta telefon kimliği başka bir kurum bağlantısında bulundu; yeniden bağlantı gerekli.'
FROM duplicate_numbers
WHERE provider."id" = duplicate_numbers."id" AND duplicate_numbers.row_no > 1;
CREATE UNIQUE INDEX "WhatsappProviderConfig_phoneNumberId_key" ON "WhatsappProviderConfig"("phoneNumberId");

CREATE TABLE "WhatsappSignupSession" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappSignupSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappSignupSession_stateHash_key" ON "WhatsappSignupSession"("stateHash");
CREATE INDEX "WhatsappSignupSession_institutionId_expiresAt_idx" ON "WhatsappSignupSession"("institutionId", "expiresAt");
ALTER TABLE "WhatsappSignupSession" ADD CONSTRAINT "WhatsappSignupSession_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Setting"
  ADD COLUMN "whatsappSmsFallback" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "whatsappAppointmentEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "whatsappPaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "whatsappInfoEnabled" BOOLEAN NOT NULL DEFAULT true;
