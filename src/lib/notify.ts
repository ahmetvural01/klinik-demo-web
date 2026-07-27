import { prisma } from "@/lib/prisma";
import { sendSms, type SmsSendResult } from "@/lib/sms";
import { sendWhatsapp } from "@/lib/whatsapp";

/**
 * Kurumun bildirim kanalını (SMS ya da WhatsApp) tek noktadan yönlendirir.
 * WhatsApp yalnızca süperadmin'in Institution.whatsappEnabled bayrağını açtığı
 * kliniklerde denenir — açıksa ve gönderim başarılıysa SMS bakiyesi hiç
 * kontrol edilmez/tüketilmez. WhatsApp kapalıysa ya da gönderim başarısız
 * olursa (ör. henüz sağlayıcı ayarlanmamışsa) SMS'e düşülür, böylece mevcut
 * akışlar (bakiye kontrolü dahil) hiç bozulmaz.
 *
 * Şu an yalnızca randevu "bilgilendirme" SMS'i bu sarmalayıcıdan geçiyor
 * (bkz. src/app/api/appointments/route.ts sendAppointmentInfoSms). Hatırlatma,
 * doğum günü ve toplu gönderim akışları aynı desenle buraya taşınabilir.
 */
export async function sendNotification(institutionId: string | null | undefined, phone: string, message: string): Promise<SmsSendResult & { channel: "WHATSAPP" | "SMS" }> {
  if (institutionId) {
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { whatsappEnabled: true },
    });

    if (institution?.whatsappEnabled) {
      const result = await sendWhatsapp(phone, message);
      if (result.success) {
        return { ...result, channel: "WHATSAPP" };
      }
      // WhatsApp denendi ama başarısız oldu (ör. sağlayıcı henüz ayarlanmamış)
      // — hastaya bilgilendirme hiç gitmemesindense SMS'e düşülür.
    }
  }

  const result = await sendSms(phone, message);
  return { ...result, channel: "SMS" };
}
