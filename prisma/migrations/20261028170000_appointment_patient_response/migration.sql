-- Hatırlatmadaki onay bağlantısı: hastanın "Geleceğim / Gelemeyeceğim" yanıtı.
CREATE TYPE "AppointmentPatientResponse" AS ENUM ('GELECEK', 'GELEMEYECEK');

ALTER TABLE "Appointment" ADD COLUMN "confirmToken" TEXT,
ADD COLUMN "patientResponse" "AppointmentPatientResponse",
ADD COLUMN "patientRespondedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Appointment_confirmToken_key" ON "Appointment"("confirmToken");
