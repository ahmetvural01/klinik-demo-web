-- Eski katalogdan kalan aynı tarihli/yanlış tarihli tekrarları veri kaybı
-- oluşturmadan görünümden kaldır. Kayıtlar gerektiğinde denetim amacıyla
-- korunur; yeni kanonik katalog satırları uygulama tarafından kullanılır.
UPDATE "CelebrationDay"
SET "isActive" = false
WHERE "code" IN ('CUMHURIYET_BAYRAMI', 'DIS_HEKIMLIGI_GUNU');

UPDATE "CelebrationDay"
SET "month" = 3, "day" = 1
WHERE "code" = 'MUHASEBECILER_GUNU';

UPDATE "CelebrationDay"
SET "title" = '14 Mart Tıp Bayramı'
WHERE "code" = 'TIP_BAYRAMI';

UPDATE "CelebrationDay"
SET "targetProfessions" = ARRAY['Avukat']::TEXT[]
WHERE "code" = 'AVUKATLAR_GUNU';

UPDATE "CelebrationDay"
SET "targetProfessions" = ARRAY['Öğretmen']::TEXT[]
WHERE "code" = 'OGRETMENLER_GUNU';
