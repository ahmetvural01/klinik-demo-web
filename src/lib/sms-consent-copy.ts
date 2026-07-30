// SMS onay metni ve SMS'in kendisi SABİTTİR — klinikler değiştiremez, yalnızca
// klinik adı gibi değişken alanlar otomatik doldurulur (bkz.
// docs/ILETISIM-MIMARISI-RAPORU.md §1, kullanıcı onayı §6). Bu dosya prisma
// içermez — hem sunucu (src/lib/sms-consent.ts) hem istemci (SMS Ayarları
// önizlemesi, /sms-onay sayfası) tarafından güvenle import edilebilir.

export const SMS_CONSENT_MESSAGE_TEMPLATE =
  "{{institutionName}}: Randevu, tedavi ve ödeme bilgilendirme, hatırlatma ve özel gün SMS'leri " +
  "gönderebilmemiz için onayınız gerekiyor. Onaylamak/reddetmek için: {{link}}";

export const SMS_CONSENT_EXPLANATION_ITEMS = [
  "randevu oluşturma",
  "randevu değişikliği",
  "randevu iptali",
  "randevu hatırlatma",
  "tedavi süreci bilgilendirmeleri",
  "ödeme ve borç bilgilendirmeleri",
  "doğum günü",
  "bayram",
  "özel gün kutlamaları",
];
