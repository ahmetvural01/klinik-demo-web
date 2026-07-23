-- AlterTable
ALTER TABLE "Setting" ADD COLUMN "paymentReminderWindowDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Setting" ADD COLUMN "reviewLink" TEXT;
ALTER TABLE "Setting" ADD COLUMN "birthdaySmsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BirthdaySmsLog" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sentTo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorDetail" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthdaySmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BirthdaySmsLog_patientId_year_key" ON "BirthdaySmsLog"("patientId", "year");

-- AddForeignKey
ALTER TABLE "BirthdaySmsLog" ADD CONSTRAINT "BirthdaySmsLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
