DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "WhatsappMessage" x JOIN "WhatsappProviderConfig" y ON y.id = x."providerId"
    WHERE x."providerId" IS NOT NULL AND x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "UserBranch" x JOIN "User" y ON y.id = x."userId"
    WHERE x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "DoctorRateHistory" x JOIN "User" y ON y.id = x."doctorId"
    WHERE x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "PatientAccessLog" x JOIN "Patient" y ON y.id = x."patientId"
    WHERE x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "PatientFollowUp" x JOIN "User" y ON y.id = x."doctorId"
    WHERE x."doctorId" IS NOT NULL AND x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "PatientConsent" x JOIN "Patient" y ON y.id = x."patientId"
    WHERE x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "PatientPackage" x JOIN "PackageDefinition" y ON y.id = x."definitionId"
    WHERE x."definitionId" IS NOT NULL AND x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "PatientSmsPreference" x JOIN "Patient" y ON y.id = x."patientId"
    WHERE x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "PatientSmsPreference" x JOIN "PatientSmsConsentToken" y ON y.id = x."consentTokenId"
    WHERE x."consentTokenId" IS NOT NULL AND x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "PatientSmsPreferenceEvent" x JOIN "Patient" y ON y.id = x."patientId"
    WHERE x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "PatientSmsConsentToken" x JOIN "Patient" y ON y.id = x."patientId"
    WHERE x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "Expense" x JOIN "ExpenseCategory" y ON y.id = x."categoryId"
    WHERE x."categoryId" IS NOT NULL AND x."institutionId" IS DISTINCT FROM y."institutionId"
  ) OR EXISTS (
    SELECT 1 FROM "Document" x JOIN "Patient" y ON y.id = x."patientId"
    WHERE x."institutionId" IS DISTINCT FROM y."institutionId"
  ) THEN
    RAISE EXCEPTION 'Secondary tenant relation preflight failed';
  END IF;
END $$;

ALTER TABLE "DoctorRateHistory" DROP CONSTRAINT "DoctorRateHistory_doctorId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT "Document_patientId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_categoryId_fkey";
ALTER TABLE "PatientAccessLog" DROP CONSTRAINT "PatientAccessLog_patientId_fkey";
ALTER TABLE "PatientConsent" DROP CONSTRAINT "PatientConsent_patientId_fkey";
ALTER TABLE "PatientFollowUp" DROP CONSTRAINT "PatientFollowUp_doctorId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT "PatientPackage_definitionId_fkey";
ALTER TABLE "PatientSmsConsentToken" DROP CONSTRAINT "PatientSmsConsentToken_patientId_fkey";
ALTER TABLE "PatientSmsPreference" DROP CONSTRAINT "PatientSmsPreference_consentTokenId_fkey";
ALTER TABLE "PatientSmsPreference" DROP CONSTRAINT "PatientSmsPreference_patientId_fkey";
ALTER TABLE "PatientSmsPreferenceEvent" DROP CONSTRAINT "PatientSmsPreferenceEvent_patientId_fkey";
ALTER TABLE "UserBranch" DROP CONSTRAINT "UserBranch_userId_fkey";
ALTER TABLE "WhatsappMessage" DROP CONSTRAINT "WhatsappMessage_providerId_fkey";

CREATE UNIQUE INDEX "ExpenseCategory_id_institutionId_key" ON "ExpenseCategory"("id", "institutionId");
CREATE UNIQUE INDEX "PackageDefinition_id_institutionId_key" ON "PackageDefinition"("id", "institutionId");
CREATE UNIQUE INDEX "Patient_id_institutionId_key" ON "Patient"("id", "institutionId");
CREATE UNIQUE INDEX "PatientSmsConsentToken_id_institutionId_key" ON "PatientSmsConsentToken"("id", "institutionId");
CREATE UNIQUE INDEX "PatientSmsPreference_patientId_institutionId_key" ON "PatientSmsPreference"("patientId", "institutionId");
CREATE UNIQUE INDEX "WhatsappProviderConfig_id_institutionId_key" ON "WhatsappProviderConfig"("id", "institutionId");

ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_providerId_institutionId_fkey" FOREIGN KEY ("providerId", "institutionId") REFERENCES "WhatsappProviderConfig"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_institutionId_fkey" FOREIGN KEY ("userId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DoctorRateHistory" ADD CONSTRAINT "DoctorRateHistory_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientAccessLog" ADD CONSTRAINT "PatientAccessLog_patientId_institutionId_fkey" FOREIGN KEY ("patientId", "institutionId") REFERENCES "Patient"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientFollowUp" ADD CONSTRAINT "PatientFollowUp_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_institutionId_fkey" FOREIGN KEY ("patientId", "institutionId") REFERENCES "Patient"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_definitionId_institutionId_fkey" FOREIGN KEY ("definitionId", "institutionId") REFERENCES "PackageDefinition"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientSmsPreference" ADD CONSTRAINT "PatientSmsPreference_patientId_institutionId_fkey" FOREIGN KEY ("patientId", "institutionId") REFERENCES "Patient"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientSmsPreference" ADD CONSTRAINT "PatientSmsPreference_consentTokenId_institutionId_fkey" FOREIGN KEY ("consentTokenId", "institutionId") REFERENCES "PatientSmsConsentToken"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientSmsPreferenceEvent" ADD CONSTRAINT "PatientSmsPreferenceEvent_patientId_institutionId_fkey" FOREIGN KEY ("patientId", "institutionId") REFERENCES "Patient"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientSmsConsentToken" ADD CONSTRAINT "PatientSmsConsentToken_patientId_institutionId_fkey" FOREIGN KEY ("patientId", "institutionId") REFERENCES "Patient"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_institutionId_fkey" FOREIGN KEY ("categoryId", "institutionId") REFERENCES "ExpenseCategory"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_patientId_institutionId_fkey" FOREIGN KEY ("patientId", "institutionId") REFERENCES "Patient"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
