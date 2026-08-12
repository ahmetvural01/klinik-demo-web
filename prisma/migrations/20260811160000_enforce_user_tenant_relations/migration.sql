DO $$
DECLARE mismatch_count integer;
BEGIN
  SELECT COUNT(*) INTO mismatch_count FROM (
    SELECT a.id FROM "Appointment" a JOIN "User" u ON u.id = a."doctorId" WHERE u."institutionId" IS DISTINCT FROM a."institutionId"
    UNION ALL SELECT x.id FROM "ClinicTask" x JOIN "User" u ON u.id = x."assignedToId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "ClinicTask" x JOIN "User" u ON u.id = x."createdById" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "Examination" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "Payment" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "DoctorBlock" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "Message" x JOIN "User" u ON u.id = x."userId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "Prescription" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "TreatmentPlan" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "PatientPackage" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "LabOrder" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "StockMovement" x JOIN "User" u ON u.id = x."userId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "TaksitPlan" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "Expense" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "Purchase" x JOIN "User" u ON u.id = x."createdById" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "Waitlist" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "Waitlist" x JOIN "User" u ON u.id = x."createdById" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
    UNION ALL SELECT x.id FROM "BookingRequest" x JOIN "User" u ON u.id = x."doctorId" WHERE u."institutionId" IS DISTINCT FROM x."institutionId"
  ) mismatches;
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'User tenant relation audit failed: % mismatched rows', mismatch_count;
  END IF;
END $$;

ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_doctorId_fkey";
ALTER TABLE "BookingRequest" DROP CONSTRAINT "BookingRequest_doctorId_fkey";
ALTER TABLE "ClinicTask" DROP CONSTRAINT "ClinicTask_assignedToId_fkey";
ALTER TABLE "ClinicTask" DROP CONSTRAINT "ClinicTask_createdById_fkey";
ALTER TABLE "DoctorBlock" DROP CONSTRAINT "DoctorBlock_doctorId_fkey";
ALTER TABLE "Examination" DROP CONSTRAINT "Examination_doctorId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_doctorId_fkey";
ALTER TABLE "LabOrder" DROP CONSTRAINT "LabOrder_doctorId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT "Message_userId_fkey";
ALTER TABLE "PatientPackage" DROP CONSTRAINT "PatientPackage_doctorId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_doctorId_fkey";
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_doctorId_fkey";
ALTER TABLE "Purchase" DROP CONSTRAINT "Purchase_createdById_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_userId_fkey";
ALTER TABLE "TaksitPlan" DROP CONSTRAINT "TaksitPlan_doctorId_fkey";
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT "TreatmentPlan_doctorId_fkey";
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_createdById_fkey";
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_doctorId_fkey";

CREATE UNIQUE INDEX "User_id_institutionId_key" ON "User"("id", "institutionId");

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ClinicTask" ADD CONSTRAINT "ClinicTask_assignedToId_institutionId_fkey" FOREIGN KEY ("assignedToId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ClinicTask" ADD CONSTRAINT "ClinicTask_createdById_institutionId_fkey" FOREIGN KEY ("createdById", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Examination" ADD CONSTRAINT "Examination_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "DoctorBlock" ADD CONSTRAINT "DoctorBlock_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_institutionId_fkey" FOREIGN KEY ("userId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_institutionId_fkey" FOREIGN KEY ("userId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "TaksitPlan" ADD CONSTRAINT "TaksitPlan_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_institutionId_fkey" FOREIGN KEY ("createdById", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_createdById_institutionId_fkey" FOREIGN KEY ("createdById", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_doctorId_institutionId_fkey" FOREIGN KEY ("doctorId", "institutionId") REFERENCES "User"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;
