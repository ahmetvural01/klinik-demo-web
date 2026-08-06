ALTER TABLE "ClinicTask" ADD COLUMN "requestKey" TEXT;

CREATE UNIQUE INDEX "ClinicTask_requestKey_key" ON "ClinicTask"("requestKey");
