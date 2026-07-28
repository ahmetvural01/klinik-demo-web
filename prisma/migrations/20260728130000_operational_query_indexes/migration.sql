CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Patient_fullName_trgm_idx"
ON "Patient" USING GIN ("fullName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Patient_phone_trgm_idx"
ON "Patient" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Patient_tcNo_trgm_idx"
ON "Patient" USING GIN ("tcNo" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Appointment_patientId_startAt_idx"
ON "Appointment"("patientId", "startAt");

CREATE INDEX IF NOT EXISTS "Examination_patientId_diagnosedAt_idx"
ON "Examination"("patientId", "diagnosedAt");

CREATE INDEX IF NOT EXISTS "Examination_doctorId_diagnosedAt_idx"
ON "Examination"("doctorId", "diagnosedAt");

CREATE INDEX IF NOT EXISTS "Examination_patientId_status_diagnosedAt_idx"
ON "Examination"("patientId", "status", "diagnosedAt");

CREATE INDEX IF NOT EXISTS "Payment_patientId_status_createdAt_idx"
ON "Payment"("patientId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_doctorId_status_createdAt_idx"
ON "Payment"("doctorId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx"
ON "AuditLog"("userId", "createdAt");
