-- CreateTable
CREATE TABLE "SmsProviderConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "sendUrl" TEXT,
    "balanceUrl" TEXT,
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

    CONSTRAINT "SmsProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsProviderConfig_code_key" ON "SmsProviderConfig"("code");
