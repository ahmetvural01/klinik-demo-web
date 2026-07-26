-- CreateTable
CREATE TABLE "DoctorRateHistory" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "kkYuzde" DECIMAL(5,2) NOT NULL,
    "genelYuzde" DECIMAL(5,2) NOT NULL,
    "maasYuzde" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorRateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorRateHistory_doctorId_effectiveFrom_idx" ON "DoctorRateHistory"("doctorId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "DoctorRateHistory" ADD CONSTRAINT "DoctorRateHistory_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
