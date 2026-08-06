ALTER TABLE "PatientPackage" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "PatientPackageUsage" ADD COLUMN "requestKey" TEXT;

CREATE UNIQUE INDEX "PatientPackage_requestKey_key" ON "PatientPackage"("requestKey");
CREATE UNIQUE INDEX "PatientPackageUsage_requestKey_key" ON "PatientPackageUsage"("requestKey");
