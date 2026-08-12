ALTER TABLE "SmsTemplate"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "whatsappContent" TEXT,
  ADD COLUMN "whatsappTemplateName" TEXT,
  ADD COLUMN "whatsappTemplateLanguage" TEXT NOT NULL DEFAULT 'tr';

ALTER TABLE "Setting"
  ADD COLUMN "paymentReminderDaysBefore" INTEGER[] NOT NULL DEFAULT ARRAY[3]::INTEGER[],
  ADD COLUMN "paymentReminderOnDueDate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "paymentReminderOverdueEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "paymentReminderOverdueEveryDays" INTEGER NOT NULL DEFAULT 3;

UPDATE "Setting"
SET "paymentReminderDaysBefore" = ARRAY["paymentReminderWindowDays"]::INTEGER[];

ALTER TABLE "CelebrationDay"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "recurrenceRule" TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "weekOfMonth" INTEGER,
  ADD COLUMN "weekday" INTEGER,
  ADD COLUMN "dateOverrides" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "whatsappMessageTemplate" TEXT,
  ADD COLUMN "whatsappTemplateName" TEXT,
  ADD COLUMN "whatsappTemplateLanguage" TEXT NOT NULL DEFAULT 'tr';
