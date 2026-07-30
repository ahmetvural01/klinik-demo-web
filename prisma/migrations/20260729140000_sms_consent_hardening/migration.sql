-- AlterTable
ALTER TABLE "PatientSmsConsentToken" ADD COLUMN     "invalidatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PatientSmsPreference" ADD COLUMN     "lastRequestAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastRequestError" TEXT;

