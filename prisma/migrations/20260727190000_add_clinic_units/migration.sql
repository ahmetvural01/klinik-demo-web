-- Klinik üniteleri/odaları randevularda isteğe bağlı kaynak olarak tutulur.
-- Mevcut randevuların unitId değeri NULL kalır; geçmiş veriye müdahale edilmez.
CREATE TABLE "ClinicUnit" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicUnit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Appointment" ADD COLUMN "clinicUnitId" TEXT;

CREATE UNIQUE INDEX "ClinicUnit_institutionId_name_key" ON "ClinicUnit"("institutionId", "name");
CREATE UNIQUE INDEX "ClinicUnit_institutionId_code_key" ON "ClinicUnit"("institutionId", "code");
CREATE INDEX "ClinicUnit_institutionId_isActive_idx" ON "ClinicUnit"("institutionId", "isActive");
CREATE INDEX "Appointment_clinicUnitId_startAt_idx" ON "Appointment"("clinicUnitId", "startAt");

ALTER TABLE "ClinicUnit" ADD CONSTRAINT "ClinicUnit_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicUnitId_fkey"
FOREIGN KEY ("clinicUnitId") REFERENCES "ClinicUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
