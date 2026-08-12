ALTER TABLE "TaksitReminderLog" DROP CONSTRAINT "TaksitReminderLog_taksitId_fkey";
ALTER TABLE "TaksitReminderLog" ADD COLUMN "institutionId" TEXT, ADD COLUMN "branchId" TEXT;

UPDATE "TaksitReminderLog" x
SET "institutionId" = t."institutionId", "branchId" = t."branchId"
FROM "Taksit" t
WHERE t.id = x."taksitId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TaksitReminderLog" WHERE "institutionId" IS NULL OR "branchId" IS NULL) THEN
    RAISE EXCEPTION 'Installment reminder scope preflight failed';
  END IF;
END $$;

ALTER TABLE "TaksitReminderLog" ALTER COLUMN "institutionId" SET NOT NULL, ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "TaksitReminderLog" ADD CONSTRAINT "TaksitReminderLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "TaksitReminderLog" ADD CONSTRAINT "TaksitReminderLog_branchId_institutionId_fkey" FOREIGN KEY ("branchId", "institutionId") REFERENCES "ClinicBranch"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "TaksitReminderLog" ADD CONSTRAINT "TaksitReminderLog_taksitId_institutionId_branchId_fkey" FOREIGN KEY ("taksitId", "institutionId", "branchId") REFERENCES "Taksit"("id", "institutionId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;
