-- Kliniğe özel SMS gönderen adı ve platform ödeme bilgisi.
ALTER TABLE "Institution" ADD COLUMN "smsSender" TEXT;

CREATE TABLE "PlatformBillingConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "paymentInstructions" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBillingConfig_pkey" PRIMARY KEY ("id")
);
