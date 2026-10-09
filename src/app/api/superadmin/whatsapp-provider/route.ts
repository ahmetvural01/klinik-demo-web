import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getDailyLimit } from "@/lib/whatsapp-web";

async function authorize() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth;
  if (auth.user.role !== "SUPERADMIN") {
    return { ...auth, error: NextResponse.json({ message: "Yetki yok" }, { status: 403 }) };
  }
  return auth;
}

export async function GET() {
  const auth = await authorize();
  if (auth.error) return auth.error;

  // Tüm klinikler listelenir: WhatsApp erişimi bu listeden açılıp kapatılır
  // (önceden yalnız erişimi açık klinikler görünüyordu; erişim klinik
  // düzenleme penceresinin içinde gizliydi).
  const institutions = await prisma.institution.findMany({
    orderBy: [{ whatsappEnabled: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      whatsappEnabled: true,
      whatsappProviders: {
        // QR ile bağlı kendi numara (WHATSAPP_WEB) ya da resmi Meta bağlantısı;
        // en son güncellenen gösterilir.
        where: { code: { in: ["WHATSAPP_WEB", "META_EMBEDDED"] } },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          connectionStatus: true,
          displayPhoneNumber: true,
          verifiedName: true,
          connectedAt: true,
          lastSuccessfulSendAt: true,
          lastWebhookAt: true,
          updatedAt: true,
        },
      },
      whatsappWebSession: { select: { dailySentDate: true, dailySentCount: true } },
    },
  });
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const dailyLimit = getDailyLimit();

  return NextResponse.json({
    providers: institutions.map((institution) => {
      const provider = institution.whatsappProviders[0];
      return {
        institutionId: institution.id,
        institutionName: institution.name,
        institutionActive: institution.isActive,
        whatsappEnabled: institution.whatsappEnabled,
        providerId: provider?.id || null,
        connectionStatus: provider?.connectionStatus || "NOT_CONNECTED",
        displayPhoneNumber: provider?.displayPhoneNumber || null,
        verifiedName: provider?.verifiedName || null,
        connectedAt: provider?.connectedAt || null,
        lastSuccessfulSendAt: provider?.lastSuccessfulSendAt || null,
        lastWebhookAt: provider?.lastWebhookAt || null,
        updatedAt: provider?.updatedAt || null,
        todaySent: institution.whatsappWebSession?.dailySentDate === today ? institution.whatsappWebSession.dailySentCount : 0,
        dailyLimit,
      };
    }),
  });
}

export async function POST() {
  return NextResponse.json({ message: "WhatsApp numarasını klinik kendi panelinden (İletişim > Ayarlar) bağlar." }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ message: "WhatsApp bağlantı kimlik bilgileri panelden düzenlenemez." }, { status: 405 });
}
