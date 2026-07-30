-- CreateEnum
CREATE TYPE "SmsConsentStatus" AS ENUM ('PENDING', 'ENABLED', 'DISABLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SmsConsentSource" AS ENUM ('PATIENT_CARD', 'PUBLIC_LINK', 'IMPORT', 'SYSTEM_MIGRATION');

-- CreateEnum
CREATE TYPE "SmsConsentTokenPurpose" AS ENUM ('INITIAL', 'RESEND');

-- CreateEnum
CREATE TYPE "SmsDispatchStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "SmsDispatchPurpose" AS ENUM ('SERVICE', 'GREETING', 'CONSENT_REQUEST');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP');

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "defaultNotificationChannel" "NotificationChannel" NOT NULL DEFAULT 'SMS';

-- AlterTable
ALTER TABLE "WhatsappProviderConfig" ALTER COLUMN "institutionId" SET NOT NULL;

-- CreateTable
CREATE TABLE "PatientSmsPreference" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "SmsConsentStatus" NOT NULL DEFAULT 'PENDING',
    "firstConsentAt" TIMESTAMP(3),
    "lastRejectionAt" TIMESTAMP(3),
    "lastRequestSentAt" TIMESTAMP(3),
    "consentTokenId" TEXT,
    "lastChangeSource" "SmsConsentSource" NOT NULL DEFAULT 'SYSTEM_MIGRATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientSmsPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientSmsPreferenceEvent" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "oldStatus" "SmsConsentStatus",
    "newStatus" "SmsConsentStatus" NOT NULL,
    "source" "SmsConsentSource" NOT NULL,
    "tokenId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientSmsPreferenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientSmsConsentToken" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "SmsConsentTokenPurpose" NOT NULL DEFAULT 'INITIAL',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedFromIp" TEXT,
    "usedUserAgent" TEXT,
    "resultStatus" "SmsConsentStatus",
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientSmsConsentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsDispatch" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "eventType" TEXT NOT NULL,
    "purpose" "SmsDispatchPurpose" NOT NULL,
    "phoneMasked" TEXT NOT NULL,
    "messageHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "SmsDispatchStatus" NOT NULL DEFAULT 'QUEUED',
    "providerCode" TEXT,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientSmsPreference_patientId_key" ON "PatientSmsPreference"("patientId");

-- CreateIndex
CREATE INDEX "PatientSmsPreference_institutionId_idx" ON "PatientSmsPreference"("institutionId");

-- CreateIndex
CREATE INDEX "PatientSmsPreference_institutionId_status_idx" ON "PatientSmsPreference"("institutionId", "status");

-- CreateIndex
CREATE INDEX "PatientSmsPreferenceEvent_institutionId_createdAt_idx" ON "PatientSmsPreferenceEvent"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientSmsPreferenceEvent_patientId_createdAt_idx" ON "PatientSmsPreferenceEvent"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientSmsConsentToken_tokenHash_key" ON "PatientSmsConsentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PatientSmsConsentToken_institutionId_idx" ON "PatientSmsConsentToken"("institutionId");

-- CreateIndex
CREATE INDEX "PatientSmsConsentToken_patientId_createdAt_idx" ON "PatientSmsConsentToken"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsDispatch_institutionId_createdAt_idx" ON "SmsDispatch"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsDispatch_patientId_createdAt_idx" ON "SmsDispatch"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsDispatch_institutionId_idempotencyKey_key" ON "SmsDispatch"("institutionId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PatientSmsPreference" ADD CONSTRAINT "PatientSmsPreference_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSmsPreference" ADD CONSTRAINT "PatientSmsPreference_consentTokenId_fkey" FOREIGN KEY ("consentTokenId") REFERENCES "PatientSmsConsentToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSmsPreferenceEvent" ADD CONSTRAINT "PatientSmsPreferenceEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSmsConsentToken" ADD CONSTRAINT "PatientSmsConsentToken_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsDispatch" ADD CONSTRAINT "SmsDispatch_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

