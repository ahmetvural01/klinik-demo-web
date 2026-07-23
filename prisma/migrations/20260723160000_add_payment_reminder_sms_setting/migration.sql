-- AlterTable
ALTER TABLE "Setting" ADD COLUMN "paymentReminderSmsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TaksitReminderLog" (
    "id" TEXT NOT NULL,
    "taksitId" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorDetail" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaksitReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaksitReminderLog_taksitId_idx" ON "TaksitReminderLog"("taksitId");

-- AddForeignKey
ALTER TABLE "TaksitReminderLog" ADD CONSTRAINT "TaksitReminderLog_taksitId_fkey" FOREIGN KEY ("taksitId") REFERENCES "Taksit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
