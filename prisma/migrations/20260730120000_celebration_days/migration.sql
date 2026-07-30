-- CreateTable
CREATE TABLE "CelebrationDay" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "targetProfessions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "messageTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CelebrationDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CelebrationDaySetting" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "celebrationCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CelebrationDaySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CelebrationSmsLog" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "celebrationCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sentTo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorDetail" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CelebrationSmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CelebrationDay_code_key" ON "CelebrationDay"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CelebrationDaySetting_institutionId_celebrationCode_key" ON "CelebrationDaySetting"("institutionId", "celebrationCode");

-- CreateIndex
CREATE UNIQUE INDEX "CelebrationSmsLog_patientId_celebrationCode_year_key" ON "CelebrationSmsLog"("patientId", "celebrationCode", "year");

-- AddForeignKey
ALTER TABLE "CelebrationDaySetting" ADD CONSTRAINT "CelebrationDaySetting_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CelebrationDaySetting" ADD CONSTRAINT "CelebrationDaySetting_celebrationCode_fkey" FOREIGN KEY ("celebrationCode") REFERENCES "CelebrationDay"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CelebrationSmsLog" ADD CONSTRAINT "CelebrationSmsLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

