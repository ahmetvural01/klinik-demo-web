-- Varsayılan randevu türü adlarında Türkçe karakter: yalnız kliniğin hiç
-- değiştirmediği (eski varsayılan yazımla duran) adlar güncellenir.
UPDATE "TreatmentType" SET "label" = 'İmplant' WHERE "value" = 'IMPLANT' AND "label" = 'Implant';
UPDATE "TreatmentType" SET "label" = 'Dişli Prova' WHERE "value" = 'DISLI_PROVA' AND "label" = 'Disli Prova';
UPDATE "TreatmentType" SET "label" = 'Dikiş Alımı' WHERE "value" = 'DIKIS_ALIM' AND "label" = 'Dikis Alim';
UPDATE "TreatmentType" SET "label" = 'Ölçü' WHERE "value" = 'OLCU' AND "label" = 'Olcu';
UPDATE "TreatmentType" SET "label" = 'Diğer' WHERE "value" = 'DIGER' AND "label" = 'Diger';
