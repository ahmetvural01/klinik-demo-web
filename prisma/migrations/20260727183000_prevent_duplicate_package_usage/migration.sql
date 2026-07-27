-- Bir randevuya aynı hasta paketinden tek seans kullanımı bağlanabilir.
-- PostgreSQL UNIQUE kısıtı NULL appointmentId kayıtlarına izin vermeye devam eder;
-- elle yapılan paket kullanımları bu nedenle engellenmez.
CREATE UNIQUE INDEX IF NOT EXISTS "PatientPackageUsage_patientPackageId_appointmentId_key"
ON "PatientPackageUsage"("patientPackageId", "appointmentId");
