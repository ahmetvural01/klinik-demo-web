-- AlterTable
ALTER TABLE "SmsTemplate" ADD COLUMN "institutionId" TEXT;

-- DropIndex
DROP INDEX "SmsTemplate_code_key";

-- CreateIndex
CREATE INDEX "SmsTemplate_code_idx" ON "SmsTemplate"("code");
CREATE UNIQUE INDEX "SmsTemplate_institutionId_code_key" ON "SmsTemplate"("institutionId", "code");

-- AddForeignKey
ALTER TABLE "SmsTemplate" ADD CONSTRAINT "SmsTemplate_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
