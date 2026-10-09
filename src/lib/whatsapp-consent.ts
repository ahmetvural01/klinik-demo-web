// Hastaya WhatsApp'tan mesaj gönderilip gönderilemeyeceğinin TEK kuralı.
//
// Klinik sahibinin kararı (9 Ekim 2026): tüm hastalar WhatsApp için varsayılan
// olarak izinli sayılır; hasta istemezse personel hasta formundan kapatır
// (Patient.whatsappOptOutAt dolar). Önceki kural yalnız açıkça işaretlenmiş
// (whatsappOptInAt dolu) hastalara izin veriyordu ve bu alan hiçbir ekranda
// işaretlenemediği için hiçbir hastaya WhatsApp gidemiyordu.
//
// Gönderim (notification-dispatch, whatsapp), toplu gönderim önizlemesi,
// kutlama günleri ve hasta ekranları bu fonksiyonu kullanmalı; kuralı tekrar
// yazmamalı.

export type WhatsappConsentFields = {
  whatsappOptOutAt?: Date | string | null;
};

export function canMessageOnWhatsapp(patient: WhatsappConsentFields | null | undefined): boolean {
  if (!patient) return false;
  return !patient.whatsappOptOutAt;
}

/** Prisma `where` parçası: WhatsApp'ı kapatmamış hastalar. */
export const WHATSAPP_ALLOWED_WHERE = { whatsappOptOutAt: null } as const;

/** Kullanıcıya gösterilecek kısa durum metni. */
export function whatsappConsentLabel(patient: WhatsappConsentFields | null | undefined): string {
  return canMessageOnWhatsapp(patient) ? "WhatsApp'tan mesaj gönderilir" : "WhatsApp'tan mesaj gönderilmez (hasta istemedi)";
}
