-- Sadeleştirme (2026-10-28): kaldırılan özelliklerin tabloları ve destek yanıtı alanları.
-- Ürün sahibi: mevcut veriler deneme/demo verisidir; yine de bekleyen tedaviler korunur.

-- 1) Ayrı "tedavi planı" kalktı: açık planlardaki bekleyen adımlar hasta dosyasındaki
--    "Planlanan tedaviler"e (ön teşhis durumundaki muayene kaydı) aktarılır.
INSERT INTO "Examination" ("id", "institutionId", "branchId", "patientId", "doctorId", "treatmentName", "toothNo", "amount", "status", "diagnosedAt", "note", "createdAt")
SELECT
  'tpmig_' || s."id",
  s."institutionId",
  s."branchId",
  p."patientId",
  p."doctorId",
  s."treatmentName",
  s."toothNo",
  s."amount",
  'Diagnoz (Ön Teşhis)',
  p."createdAt",
  LEFT('Tedavi planından aktarıldı: ' || p."title" || COALESCE(' — ' || s."note", ''), 2000),
  NOW()
FROM "TreatmentStep" s
JOIN "TreatmentPlan" p ON p."id" = s."planId"
WHERE p."status" IN ('PLANLANDI', 'DEVAM_EDIYOR')
  AND s."status" = 'BEKLIYOR'
  AND s."archivedAt" IS NULL
ON CONFLICT ("id") DO NOTHING;

-- 2) Klinik içi duyuru kalktı: yalnız sistem sahibinin (süperadmin) duyuruları kalır.
DELETE FROM "Announcement"
WHERE "createdById" IS NULL
   OR "createdById" NOT IN (SELECT "id" FROM "User" WHERE "role" = 'SUPERADMIN');

-- 3) Bekleme listesinin ayrı "Arandı" takibi kalktı (arama takibi Hasta aramaları'nda).
UPDATE "Waitlist" SET "status" = 'BEKLIYOR' WHERE "status" = 'ARANDI';

-- 4) Kaldırılan özelliklerin tabloları: ekip mesajları, tedavi planları, hasta
--    paketleri, süperadmin bölüm yetkisi.
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_branchId_institutionId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_institutionId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_userId_institutionId_fkey";
ALTER TABLE "PackageDefinition" DROP CONSTRAINT IF EXISTS "PackageDefinition_institutionId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT IF EXISTS "PatientPackage_branchId_institutionId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT IF EXISTS "PatientPackage_definitionId_institutionId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT IF EXISTS "PatientPackage_doctorId_institutionId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT IF EXISTS "PatientPackage_institutionId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT IF EXISTS "PatientPackage_patientId_institutionId_branchId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT IF EXISTS "PatientPackage_paymentId_institutionId_branchId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT IF EXISTS "PatientPackage_taksitPlanId_institutionId_branchId_fkey";
ALTER TABLE "PatientPackageUsage" DROP CONSTRAINT IF EXISTS "PatientPackageUsage_appointmentId_institutionId_branchId_fkey";
ALTER TABLE "PatientPackageUsage" DROP CONSTRAINT IF EXISTS "PatientPackageUsage_branchId_institutionId_fkey";
ALTER TABLE "PatientPackageUsage" DROP CONSTRAINT IF EXISTS "PatientPackageUsage_createdById_institutionId_fkey";
ALTER TABLE "PatientPackageUsage" DROP CONSTRAINT IF EXISTS "PatientPackageUsage_institutionId_fkey";
ALTER TABLE "PatientPackageUsage" DROP CONSTRAINT IF EXISTS "PatientPackageUsage_patientPackageId_institutionId_branchI_fkey";
ALTER TABLE "SuperadminPermission" DROP CONSTRAINT IF EXISTS "SuperadminPermission_userId_fkey";
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT IF EXISTS "TreatmentPlan_branchId_institutionId_fkey";
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT IF EXISTS "TreatmentPlan_doctorId_institutionId_fkey";
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT IF EXISTS "TreatmentPlan_institutionId_fkey";
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT IF EXISTS "TreatmentPlan_patientId_institutionId_branchId_fkey";
ALTER TABLE "TreatmentStep" DROP CONSTRAINT IF EXISTS "TreatmentStep_branchId_institutionId_fkey";
ALTER TABLE "TreatmentStep" DROP CONSTRAINT IF EXISTS "TreatmentStep_institutionId_fkey";
ALTER TABLE "TreatmentStep" DROP CONSTRAINT IF EXISTS "TreatmentStep_planId_institutionId_branchId_fkey";

DROP TABLE IF EXISTS "Message";
DROP TABLE IF EXISTS "PatientPackageUsage";
DROP TABLE IF EXISTS "PatientPackage";
DROP TABLE IF EXISTS "PackageDefinition";
DROP TABLE IF EXISTS "SuperadminPermission";
DROP TABLE IF EXISTS "TreatmentStep";
DROP TABLE IF EXISTS "TreatmentPlan";

DROP TYPE IF EXISTS "PatientPackageStatus";
DROP TYPE IF EXISTS "TreatmentPlanStatus";

-- 5) Destek talebi: yanıt zamanı ve kliniğin yanıtı gördüğü an (zil bildirimi).
--    Daha önce yanıtlanmış talepler "görüldü" sayılır (eski yanıtlar zili doldurmasın).
ALTER TABLE "SupportTicket" ADD COLUMN "answeredAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN "answerSeenAt" TIMESTAMP(3);
UPDATE "SupportTicket"
SET "answeredAt" = COALESCE("closedAt", "createdAt"),
    "answerSeenAt" = COALESCE("closedAt", "createdAt")
WHERE "answer" IS NOT NULL;
