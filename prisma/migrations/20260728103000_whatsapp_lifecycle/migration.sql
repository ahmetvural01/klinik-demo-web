ALTER TABLE "WhatsappProviderConfig"
DROP CONSTRAINT IF EXISTS "WhatsappProviderConfig_code_key";

ALTER TABLE "WhatsappProviderConfig"
ADD COLUMN "institutionId" TEXT,
ADD COLUMN "providerType" TEXT NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN "phoneNumberId" TEXT,
ADD COLUMN "businessAccountId" TEXT,
ADD COLUMN "verifyToken" TEXT,
ADD COLUMN "appSecret" TEXT,
ADD COLUMN "apiVersion" TEXT NOT NULL DEFAULT 'v23.0',
ADD COLUMN "appointmentTemplateName" TEXT,
ADD COLUMN "appointmentTemplateLanguage" TEXT NOT NULL DEFAULT 'tr';

CREATE UNIQUE INDEX "WhatsappProviderConfig_institutionId_code_key"
ON "WhatsappProviderConfig"("institutionId", "code");
CREATE INDEX "WhatsappProviderConfig_institutionId_isActive_idx"
ON "WhatsappProviderConfig"("institutionId", "isActive");
CREATE INDEX "WhatsappProviderConfig_phoneNumberId_idx"
ON "WhatsappProviderConfig"("phoneNumberId");

ALTER TABLE "WhatsappProviderConfig"
ADD CONSTRAINT "WhatsappProviderConfig_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Patient"
ADD COLUMN "preferredContactChannel" TEXT NOT NULL DEFAULT 'SMS',
ADD COLUMN "whatsappOptInAt" TIMESTAMP(3),
ADD COLUMN "whatsappOptOutAt" TIMESTAMP(3),
ADD COLUMN "communicationConsentSource" TEXT;

CREATE TABLE "WhatsappTemplate" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'tr',
  "category" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "componentsJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsappTemplate_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "WhatsappProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WhatsappTemplate_providerId_name_language_key"
ON "WhatsappTemplate"("providerId", "name", "language");
CREATE INDEX "WhatsappTemplate_providerId_status_idx"
ON "WhatsappTemplate"("providerId", "status");

CREATE TABLE "WhatsappMessage" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "providerId" TEXT,
  "patientId" TEXT,
  "appointmentId" TEXT,
  "externalMessageId" TEXT,
  "contextMessageId" TEXT,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "content" TEXT,
  "templateName" TEXT,
  "errorDetail" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsappMessage_institutionId_fkey"
    FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsappMessage_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "WhatsappProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WhatsappMessage_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WhatsappMessage_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WhatsappMessage_externalMessageId_key"
ON "WhatsappMessage"("externalMessageId");
CREATE INDEX "WhatsappMessage_institutionId_createdAt_idx"
ON "WhatsappMessage"("institutionId", "createdAt");
CREATE INDEX "WhatsappMessage_institutionId_status_idx"
ON "WhatsappMessage"("institutionId", "status");
CREATE INDEX "WhatsappMessage_patientId_createdAt_idx"
ON "WhatsappMessage"("patientId", "createdAt");
CREATE INDEX "WhatsappMessage_phone_createdAt_idx"
ON "WhatsappMessage"("phone", "createdAt");
