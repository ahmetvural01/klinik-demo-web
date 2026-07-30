import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { encryptField } from "@/lib/field-crypto";

// Klinik kendi WhatsApp bağlantısını buradan yönetir — süperadminin yalnızca
// "WhatsApp Modülünü Kullanabilir" yetkisini açması gerekir
// (Institution.whatsappEnabled), bundan sonrası tamamen self-servistir
// (bkz. docs/ILETISIM-MIMARISI-RAPORU.md §3). Self-servis akış bilinçli olarak
// Twilio üzerinden çalışır: Meta Cloud API'nin gerektirdiği phoneNumberId/
// businessAccountId gibi alanlar yerine klinik yalnızca Twilio hesabından
// kopyaladığı 3 alanı (Account SID, Auth Token, WhatsApp numarası) girer —
// aynı Account SID/Auth Token zaten SMS tarafında da kullanılan tanıdık bir
// desendir (bkz. src/lib/sms.ts sendViaTwilio). Her kliniğin tek bir Twilio
// bağlantısı olur — kod sabit "TWILIO" tutulur.
const PROVIDER_CODE = "TWILIO";

export async function GET() {
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

  const provider = await prisma.whatsappProviderConfig.findUnique({
    where: { institutionId_code: { institutionId: auth.user.institutionId, code: PROVIDER_CODE } },
  });

  if (!provider) return NextResponse.json({ provider: null });

  return NextResponse.json({
    provider: {
      id: provider.id,
      isActive: provider.isActive,
      accountSid: provider.username,
      whatsappNumber: provider.sender,
      hasAuthToken: Boolean(provider.apiKey),
      updatedAt: provider.updatedAt,
    },
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("settings:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları güncelleyebilir." }, { status: 403 });
  }
  const institutionId = auth.user.institutionId;

  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { whatsappEnabled: true, name: true },
  });
  if (!institution?.whatsappEnabled) {
    return NextResponse.json({ message: "WhatsApp modülü kliniğiniz için henüz açılmamış." }, { status: 403 });
  }

  const body = await request.json() as {
    accountSid?: string;
    authToken?: string;
    whatsappNumber?: string;
    isActive?: boolean;
  };

  if (!body.accountSid?.trim()) {
    return NextResponse.json({ message: "Twilio Account SID zorunlu." }, { status: 400 });
  }
  if (!body.whatsappNumber?.trim()) {
    return NextResponse.json({ message: "WhatsApp numarası zorunlu." }, { status: 400 });
  }

  const current = await prisma.whatsappProviderConfig.findUnique({
    where: { institutionId_code: { institutionId, code: PROVIDER_CODE } },
  });

  if (!current && !body.authToken?.trim()) {
    return NextResponse.json({ message: "Twilio Auth Token zorunlu." }, { status: 400 });
  }

  const data = {
    name: `${institution.name} WhatsApp (Twilio)`,
    providerType: "TWILIO",
    isActive: body.isActive ?? true,
    username: body.accountSid.trim(),
    sender: body.whatsappNumber.trim(),
    ...(body.authToken?.trim() ? { apiKey: encryptField(body.authToken.trim()) } : {}),
  };

  const saved = current
    ? await prisma.whatsappProviderConfig.update({ where: { id: current.id }, data })
    : await prisma.whatsappProviderConfig.create({
        data: { institutionId, code: PROVIDER_CODE, ...data },
      });

  await writeAudit(
    auth.user.id,
    current ? "WHATSAPP_PROVIDER_UPDATE" : "WHATSAPP_PROVIDER_CREATE",
    `Klinik kendi WhatsApp (Twilio) bağlantısını ${current ? "güncelledi" : "oluşturdu"} (numara: ${saved.sender}).`,
  );

  return NextResponse.json({ ok: true });
}
