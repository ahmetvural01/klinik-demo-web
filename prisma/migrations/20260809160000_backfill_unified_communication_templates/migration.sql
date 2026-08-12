UPDATE "SmsTemplate"
SET
  "title" = 'Randevu Oluşturuldu',
  "description" = 'Yeni randevu kaydedildiğinde gönderilir.',
  "category" = 'APPOINTMENT',
  "whatsappContent" = 'Merhaba {{patientName}}, {{institutionName}} randevunuz {{dateTime}} tarihine planlandı. Sağlıklı günler dileriz.'
WHERE "institutionId" IS NULL AND "code" = 'BILGI' AND "whatsappContent" IS NULL;

UPDATE "SmsTemplate"
SET
  "title" = 'Randevu Hatırlatması',
  "description" = 'Randevu öncesi otomatik hatırlatma.',
  "category" = 'APPOINTMENT',
  "whatsappContent" = 'Merhaba {{patientName}}, {{dateTime}} tarihindeki {{institutionName}} randevunuzu hatırlatmak isteriz. Doktorunuz: {{doctorName}}.'
WHERE "institutionId" IS NULL AND "code" = 'HATIRLATMA' AND "whatsappContent" IS NULL;

UPDATE "SmsTemplate"
SET
  "title" = 'Değerlendirme İsteği',
  "description" = 'Tamamlanan randevu sonrasında gönderilir.',
  "category" = 'AFTERCARE',
  "whatsappContent" = 'Merhaba {{patientName}}, {{institutionName}} deneyiminizi paylaşmanız bizi mutlu eder: {{surveyLink}}'
WHERE "institutionId" IS NULL AND "code" = 'ANKET' AND "whatsappContent" IS NULL;
