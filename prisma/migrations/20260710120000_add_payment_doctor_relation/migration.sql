-- CreateIndex
CREATE INDEX "Payment_doctorId_idx" ON "Payment"("doctorId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
