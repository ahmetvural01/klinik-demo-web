import { prisma } from "@/lib/prisma";

// Kliniğin WhatsApp'ı bağlı mı? İki bağlantı yolu var: QR kod / eşleştirme
// koduyla kendi numarası (WHATSAPP_WEB) ve resmi Meta bağlantısı
// (META_EMBEDDED). Durum ekranları ve kanal seçimi ikisini de tanımalı;
// önceden yalnız Meta kontrol ediliyordu ve QR ile bağlı klinik "bağlı değil"
// görünüyordu.
export const WHATSAPP_CONNECTION_CODES = ["WHATSAPP_WEB", "META_EMBEDDED"] as const;

export async function findConnectedWhatsapp(institutionId: string) {
  return prisma.whatsappProviderConfig.findFirst({
    where: {
      institutionId,
      code: { in: [...WHATSAPP_CONNECTION_CODES] },
      isActive: true,
      connectionStatus: "CONNECTED",
    },
    orderBy: { connectedAt: "desc" },
    select: { code: true, displayPhoneNumber: true, verifiedName: true, connectedAt: true },
  });
}
