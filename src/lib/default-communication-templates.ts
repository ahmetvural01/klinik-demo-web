import { prisma } from "@/lib/prisma";

export const DEFAULT_COMMUNICATION_TEMPLATES = [
  {
    code: "BILGI", category: "APPOINTMENT", title: "Randevu Oluşturuldu", description: "Yeni randevu kaydedildiğinde gönderilir.",
    content: "Sayın {{patientName}}, {{institutionName}} kliniğindeki randevunuz {{dateTime}} tarihine planlanmıştır.",
    whatsappContent: "Merhaba {{patientName}}, {{institutionName}} randevunuz {{dateTime}} tarihine planlandı. Sağlıklı günler dileriz.",
  },
  {
    code: "RANDEVU_DEGISIKLIK", category: "APPOINTMENT", title: "Randevu Değiştirildi", description: "Randevu tarihi, saati veya doktoru değiştiğinde gönderilir.",
    content: "Sayın {{patientName}}, {{institutionName}} randevunuz {{dateTime}} olarak güncellenmiştir. Doktorunuz: {{doctorName}}.",
    whatsappContent: "Merhaba {{patientName}}, {{institutionName}} randevunuz {{dateTime}} olarak güncellendi. Doktorunuz: {{doctorName}}.",
  },
  {
    code: "RANDEVU_IPTAL", category: "APPOINTMENT", title: "Randevu İptal Edildi", description: "Randevu iptal edildiğinde gönderilir.",
    content: "Sayın {{patientName}}, {{dateTime}} tarihli {{institutionName}} randevunuz iptal edilmiştir. Bilgi için: {{institutionPhone}}.",
    whatsappContent: "Merhaba {{patientName}}, {{dateTime}} tarihli {{institutionName}} randevunuz iptal edildi. Bilgi: {{institutionPhone}}.",
  },
  {
    code: "HATIRLATMA", category: "APPOINTMENT", title: "Randevu Hatırlatması", description: "Randevu öncesi otomatik hatırlatma.",
    content: "Sayın {{patientName}}, {{institutionName}} kliniğindeki {{dateTime}} tarihli randevunuzu hatırlatırız. Doktorunuz: {{doctorName}}.",
    whatsappContent: "Merhaba {{patientName}}, {{dateTime}} tarihindeki {{institutionName}} randevunuzu hatırlatmak isteriz. Doktorunuz: {{doctorName}}.",
  },
  {
    code: "ANKET", category: "AFTERCARE", title: "Değerlendirme İsteği", description: "Tamamlanan randevu sonrasında gönderilir.",
    content: "Sayın {{patientName}}, {{institutionName}} deneyiminizi değerlendirmek için {{surveyLink}} bağlantısını kullanabilirsiniz.",
    whatsappContent: "Merhaba {{patientName}}, {{institutionName}} deneyiminizi paylaşmanız bizi mutlu eder: {{surveyLink}}",
  },
  {
    code: "ODEME_YAKLASIYOR", category: "PAYMENT", title: "Ödeme Vadesi Yaklaşıyor", description: "Seçilen günlerde vade öncesi gönderilir.",
    content: "Sayın {{patientName}}, {{amount}} TL ödemenizin vadesi {{dueDate}} tarihidir. Son {{daysLeft}} gün. {{institutionName}}.",
    whatsappContent: "Merhaba {{patientName}}, {{amount}} TL ödemenizin vadesi {{dueDate}}. Kalan süre: {{daysLeft}} gün. {{institutionName}}.",
  },
  {
    code: "ODEME_VADE_GUNU", category: "PAYMENT", title: "Ödeme Vade Günü", description: "Ödemenin vade gününde gönderilir.",
    content: "Sayın {{patientName}}, {{amount}} TL tutarındaki ödemenizin vadesi bugündür. {{institutionName}}.",
    whatsappContent: "Merhaba {{patientName}}, {{amount}} TL ödemenizin vadesi bugün. Bilgi için {{institutionPhone}}. {{institutionName}}.",
  },
  {
    code: "ODEME_GECIKTI", category: "PAYMENT", title: "Geciken Ödeme", description: "Gecikme tekrar planına göre gönderilir.",
    content: "Sayın {{patientName}}, {{amount}} TL ödemenizin vadesi {{daysLate}} gün geçmiştir. {{institutionName}}.",
    whatsappContent: "Merhaba {{patientName}}, {{amount}} TL ödemeniz {{daysLate}} gündür gecikmiş görünüyor. Bilgi için {{institutionPhone}}.",
  },
  {
    code: "DOGUM_GUNU", category: "GREETING", title: "Doğum Günü", description: "Doğum gününde yılda bir kez gönderilir.",
    content: "Sayın {{patientName}}, doğum gününüzü kutlar, sağlık ve mutluluk dolu bir yıl dileriz. {{institutionName}} ailesi.",
    whatsappContent: "Doğum gününüz kutlu olsun {{patientName}}. Sağlık ve mutluluk dolu nice yıllar dileriz. {{institutionName}} ailesi.",
  },
  {
    code: "GENEL_BILGI", category: "GENERAL", title: "Genel Bilgilendirme", description: "Manuel bilgilendirme ve duyurular için başlangıç şablonu.",
    content: "Sayın {{patientName}}, {{institutionName}} tarafından bilgilendirme: ",
    whatsappContent: "Merhaba {{patientName}}, {{institutionName}} tarafından bilgilendirme: ",
  },
] as const;

export async function ensureDefaultCommunicationTemplates() {
  const existing = await prisma.smsTemplate.findMany({ where: { institutionId: null }, select: { code: true } });
  const existingCodes = new Set(existing.map((template) => template.code));
  const missing = DEFAULT_COMMUNICATION_TEMPLATES.filter((template) => !existingCodes.has(template.code));
  if (missing.length > 0) {
    await prisma.smsTemplate.createMany({ data: missing.map((template) => ({ ...template, isActive: true })) });
  }
}
