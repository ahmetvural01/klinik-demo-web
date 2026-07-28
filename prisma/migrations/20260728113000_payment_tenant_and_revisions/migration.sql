ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "institutionId" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voidedById" TEXT,
  ADD COLUMN IF NOT EXISTS "voidReason" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Payment" AS payment
SET "institutionId" = patient."institutionId"
FROM "Patient" AS patient
WHERE payment."patientId" = patient."id"
  AND payment."institutionId" IS NULL;

UPDATE "Payment" AS payment
SET "institutionId" = app_user."institutionId"
FROM "User" AS app_user
WHERE payment."doctorId" = app_user."id"
  AND payment."institutionId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Payment" WHERE "institutionId" IS NULL) THEN
    RAISE EXCEPTION 'Kurum bağlantısı kurulamayan ödeme kayıtları var. Migration güvenli biçimde durduruldu.';
  END IF;
END $$;

ALTER TABLE "Payment" ALTER COLUMN "institutionId" SET NOT NULL;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Payment_institutionId_status_createdAt_idx"
  ON "Payment"("institutionId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "PaymentRevision" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "beforeData" JSONB NOT NULL,
  "afterData" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRevision_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PaymentRevision_paymentId_createdAt_idx"
  ON "PaymentRevision"("paymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentRevision_actorId_createdAt_idx"
  ON "PaymentRevision"("actorId", "createdAt");
