-- Every branch-owned record mutated directly by clinic APIs needs a compound
-- unique selector so institution/branch ownership is part of the mutation.
CREATE UNIQUE INDEX "PatientFollowUpEvent_id_institutionId_branchId_key" ON "PatientFollowUpEvent"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "Examination_id_institutionId_branchId_key" ON "Examination"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "Prescription_id_institutionId_branchId_key" ON "Prescription"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "Expense_id_institutionId_branchId_key" ON "Expense"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "FirmaKontakt_id_institutionId_branchId_key" ON "FirmaKontakt"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "Reminder_id_institutionId_branchId_key" ON "Reminder"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "Waitlist_id_institutionId_branchId_key" ON "Waitlist"("id", "institutionId", "branchId");
CREATE UNIQUE INDEX "BookingRequest_id_institutionId_branchId_key" ON "BookingRequest"("id", "institutionId", "branchId");
