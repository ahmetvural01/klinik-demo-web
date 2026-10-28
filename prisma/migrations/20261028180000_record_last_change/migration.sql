-- Kayıt pencerelerinde "Son değişiklik: kim, ne zaman" satırı.
ALTER TABLE "Patient" ADD COLUMN "updatedById" TEXT;

ALTER TABLE "Appointment" ADD COLUMN "createdById" TEXT,
ADD COLUMN "updatedById" TEXT;
