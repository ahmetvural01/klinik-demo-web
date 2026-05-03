-- CreateTable
CREATE TABLE "PlatformSmsWallet" (
    "id" SERIAL NOT NULL,
    "availableBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSmsWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSmsPurchase" (
    "id" TEXT NOT NULL,
    "walletId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2),
    "totalCost" DECIMAL(10,2),
    "provider" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSmsPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsTemplate_code_key" ON "SmsTemplate"("code");

-- AddForeignKey
ALTER TABLE "SmsTransaction" ADD CONSTRAINT "SmsTransaction_smsPackageId_fkey" FOREIGN KEY ("smsPackageId") REFERENCES "SmsPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSmsPurchase" ADD CONSTRAINT "PlatformSmsPurchase_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "PlatformSmsWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
