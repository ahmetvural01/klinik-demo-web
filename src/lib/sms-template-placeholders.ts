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
];

export function renderSmsPreview(content: string): string {
  return SMS_PLACEHOLDERS.reduce(
    (text, p) => text.replaceAll(`{{${p.token}}}`, p.sample),
    content
  );
}
