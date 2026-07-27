-- WhatsApp as a parallel notification channel to SMS. Pluggable provider
-- config (no specific provider chosen yet) mirroring SmsProviderConfig/
-- MockSmsLog. whatsappEnabled is superadmin-controlled per institution;
-- clinics cannot turn this on themselves.
CREATE TABLE "WhatsappProviderConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "sendUrl" TEXT,
    "httpMethod" TEXT NOT NULL DEFAULT 'POST',
    "username" TEXT,
    "password" TEXT,
    "apiKey" TEXT,
    "sender" TEXT,
    "headersJson" TEXT,
    "bodyTemplate" TEXT,
    "successPattern" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappProviderConfig_code_key" ON "WhatsappProviderConfig"("code");

CREATE TABLE "MockWhatsappLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sender" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "responseData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockWhatsappLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Institution" ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false;
