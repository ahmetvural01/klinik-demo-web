import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { testWhatsappProviderSend } from "@/lib/whatsapp";

const PROVIDER_CODE = "META_CLOUD";

// Kliniğin kendi bağlantısını test etmesi — providerId istemciden alınmaz,
// yalnızca kendi kurumunun kaydı sorgulanır (IDOR'a kapalı).
export async function POST(request: NextRequest) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları erişebilir." }, { status: 403 });
  }

  const institution = await prisma.institution.findUnique({
    where: { id: auth.user.institutionId },
    select: { whatsappEnabled: true },
  });
  if (!institution?.whatsappEnabled) {
    return NextResponse.json({ message: "WhatsApp modülü kliniğiniz için henüz açılmamış." }, { status: 403 });
  }

  const body = await request.json() as { phone?: string; message?: string };
  if (!body.phone?.trim() || !body.message?.trim()) {
    return NextResponse.json({ message: "Telefon ve mesaj zorunlu." }, { status: 400 });
  }

  const provider = await prisma.whatsappProviderConfig.findUnique({
    where: { institutionId_code: { institutionId: auth.user.institutionId, code: PROVIDER_CODE } },
  });
  if (!provider) {
    return NextResponse.json({ message: "Önce WhatsApp bağlantınızı kaydedin." }, { status: 404 });
  }

  const result = await testWhatsappProviderSend(provider.id, body.phone.trim(), body.message.trim());
  await writeAudit(
    auth.user.id,
    "WHATSAPP_PROVIDER_TEST_SEND",
    `Klinik WhatsApp test gönderimi: ${body.phone.trim()} / ${result.success ? "başarılı" : "başarısız"}`,
  );

  return NextResponse.json({
    ok: result.success,
    error: result.error,
    providerMessageId: result.providerMessageId,
  });
}
