// SMS şablonlarında kullanılan {{token}} yer tutucuları — kullanıcıya ham
// süslü parantez yerine tıklanabilir Türkçe etiketler ve örnek bir önizleme
// gösterebilmek için tek yerden tanımlanır (bkz. TemplatesTab.tsx).
export type SmsPlaceholder = { token: string; label: string; sample: string };

export const SMS_PLACEHOLDERS: SmsPlaceholder[] = [
  { token: "institutionName", label: "Klinik Adı", sample: "Beyaz Diş Kliniği" },
  { token: "patientName", label: "Hasta Adı", sample: "Ayşe Yılmaz" },
  { token: "dateTime", label: "Randevu Tarihi/Saati", sample: "12.08.2026 14:30" },
  { token: "doctorName", label: "Doktor Adı", sample: "Dr. Mehmet Demir" },
  { token: "dueDate", label: "Vade Tarihi", sample: "15.08.2026" },
  { token: "amount", label: "Tutar (TL)", sample: "1.250" },
  { token: "daysLeft", label: "Kalan Gün Sayısı", sample: "3" },
  { token: "daysLate", label: "Gecikme Gün Sayısı", sample: "5" },
  { token: "institutionPhone", label: "Klinik Telefonu", sample: "0322 123 45 67" },
  { token: "surveyLink", label: "Değerlendirme Bağlantısı", sample: "https://g.page/r/xxxx/review" },
];

export function renderSmsPreview(content: string): string {
  return SMS_PLACEHOLDERS.reduce(
    (text, p) => text.replaceAll(`{{${p.token}}}`, p.sample),
    content
  );
}

function placeholderTag(p: SmsPlaceholder) {
  return `[${p.label}]`;
}

// Şablon içeriği veritabanında her zaman ham {{token}} biçiminde saklanır
// (renderTemplate bunu bekler — bkz. sms-jobs.ts, appointments/route.ts vb.)
// ama kullanıcıya düzenleme kutusunda süslü parantez yerine "[Hasta Adı]" gibi
// okunaklı bir etiket gösterilir. Bu iki fonksiyon o çeviriyi ekranın giriş/
// çıkışında yapar; textarea'daki metin HER ZAMAN okunaklı biçimdedir.
export function toReadableText(content: string): string {
  return SMS_PLACEHOLDERS.reduce(
    (text, p) => text.replaceAll(`{{${p.token}}}`, placeholderTag(p)),
    content
  );
}

export function toStoredText(readableText: string): string {
  return SMS_PLACEHOLDERS.reduce(
    (text, p) => text.replaceAll(placeholderTag(p), `{{${p.token}}}`),
    readableText
  );
}
