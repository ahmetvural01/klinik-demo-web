ALTER TABLE "SmtpConfig" ALTER COLUMN "fromName" SET DEFAULT 'KlinikCep';

UPDATE "SmtpConfig"
SET "fromName" = 'KlinikCep'
WHERE "fromName" IN ('KlinikModern', 'Klinik Modern', 'Klinik Yönetim Paneli');

UPDATE "Advertisement"
SET "sponsorName" = 'KlinikCep Demo'
WHERE "sponsorName" IN ('KlinikModern Demo', 'Klinik Modern Demo');

UPDATE "SmsProviderConfig"
SET "sender" = 'KlinikCep'
WHERE "sender" IN ('KlinikModern', 'Klinik Modern');

UPDATE "WhatsappProviderConfig"
SET "sender" = 'KlinikCep'
WHERE "sender" IN ('KlinikModern', 'Klinik Modern');

UPDATE "MockSmsLog"
SET "sender" = 'KlinikCep'
WHERE "sender" IN ('KlinikModern', 'Klinik Modern');

UPDATE "MockWhatsappLog"
SET "sender" = 'KlinikCep'
WHERE "sender" IN ('KlinikModern', 'Klinik Modern');
