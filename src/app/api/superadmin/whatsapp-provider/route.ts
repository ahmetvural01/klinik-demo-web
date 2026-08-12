import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getMetaWhatsappReadiness } from "@/lib/meta-whatsapp";

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

  const institutions = await prisma.institution.findMany({
    where: { whatsappEnabled: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isActive: true,
      whatsappProviders: {
        where: { code: "META_EMBEDDED" },
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
    },
  });

  return NextResponse.json({
    platform: getMetaWhatsappReadiness(),
    providers: institutions.map((institution) => {
      const provider = institution.whatsappProviders[0];
      return {
        institutionId: institution.id,
        institutionName: institution.name,
        institutionActive: institution.isActive,
        providerId: provider?.id || null,
        connectionStatus: provider?.connectionStatus || "NOT_CONNECTED",
        displayPhoneNumber: provider?.displayPhoneNumber || null,
        verifiedName: provider?.verifiedName || null,
        connectedAt: provider?.connectedAt || null,
        lastSuccessfulSendAt: provider?.lastSuccessfulSendAt || null,
        lastWebhookAt: provider?.lastWebhookAt || null,
        updatedAt: provider?.updatedAt || null,
      };
    }),
  });
}

export async function POST() {
  return NextResponse.json({ message: "WhatsApp bağlantıları yalnızca klinik Embedded Signup akışından oluşturulur." }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ message: "WhatsApp bağlantı kimlik bilgileri panelden düzenlenemez." }, { status: 405 });
}
