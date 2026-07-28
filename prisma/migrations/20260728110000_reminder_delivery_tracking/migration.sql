ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'BASARISIZ';

ALTER TABLE "Reminder"
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastError" TEXT,
  ADD COLUMN IF NOT EXISTS "lastChannel" TEXT;

CREATE INDEX IF NOT EXISTS "Reminder_status_reminderDate_idx"
  ON "Reminder"("status", "reminderDate");

CREATE INDEX IF NOT EXISTS "Reminder_status_nextAttemptAt_idx"
  ON "Reminder"("status", "nextAttemptAt");
