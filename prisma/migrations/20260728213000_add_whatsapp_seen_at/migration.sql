ALTER TABLE "WhatsappMessage" ADD COLUMN "seenAt" TIMESTAMP(3);

CREATE INDEX "WhatsappMessage_institutionId_direction_seenAt_idx"
ON "WhatsappMessage"("institutionId", "direction", "seenAt");
