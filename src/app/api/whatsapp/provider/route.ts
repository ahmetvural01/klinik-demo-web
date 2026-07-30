import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { encryptField } from "@/lib/field-crypto";

// Klinik kendi WhatsApp Business bağlantısını buradan yönetir — süperadminin
// yalnızca "WhatsApp Modülünü Kullanabilir" yetkisini açması gerekir
// (Institution.whatsappEnabled), bundan sonrası tamamen self-servistir
// (bkz. docs/ILETISIM-MIMARISI-RAPORU.md §3). Her kliniğin tek bir Meta Cloud
// bağlantısı olur — kod sabit "META_CLOUD" tutulur.
const PROVIDER_CODE = "META_CLOUD";

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
      name: provider.name,
      isActive: provider.isActive,
      sender: provider.sender,
      phoneNumberId: provider.phoneNumberId,
      businessAccountId: provider.businessAccountId,
      apiVersion: provider.apiVersion,
      appointmentTemplateName: provider.appointmentTemplateName,
      appointmentTemplateLanguage: provider.appointmentTemplateLanguage,
      hasApiKey: Boolean(provider.apiKey),
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
    sender?: string;
    phoneNumberId?: string;
    businessAccountId?: string;
    apiKey?: string;
    apiVersion?: string;
    appointmentTemplateName?: string;
    appointmentTemplateLanguage?: string;
    isActive?: boolean;
  };

  if (!body.phoneNumberId?.trim()) {
    return NextResponse.json({ message: "Telefon Numarası Kimliği zorunlu." }, { status: 400 });
  }

  const current = await prisma.whatsappProviderConfig.findUnique({
    where: { institutionId_code: { institutionId, code: PROVIDER_CODE } },
  });

  if (!current && !body.apiKey?.trim()) {
    return NextResponse.json({ message: "Erişim Token'ı zorunlu." }, { status: 400 });
  }

  const data = {
    name: `${institution.name} WhatsApp`,
    providerType: "META_CLOUD",
    isActive: body.isActive ?? true,
    sender: body.sender?.trim() || null,
    phoneNumberId: body.phoneNumberId.trim(),
    businessAccountId: body.businessAccountId?.trim() || null,
    apiVersion: body.apiVersion?.trim() || "v23.0",
    appointmentTemplateName: body.appointmentTemplateName?.trim() || null,
    appointmentTemplateLanguage: body.appointmentTemplateLanguage?.trim() || "tr",
    ...(body.apiKey?.trim() ? { apiKey: encryptField(body.apiKey.trim()) } : {}),
  };

  const saved = current
    ? await prisma.whatsappProviderConfig.update({ where: { id: current.id }, data })
    : await prisma.whatsappProviderConfig.create({
        data: { institutionId, code: PROVIDER_CODE, ...data },
      });

  await writeAudit(
    auth.user.id,
    current ? "WHATSAPP_PROVIDER_UPDATE" : "WHATSAPP_PROVIDER_CREATE",
    `Klinik kendi WhatsApp bağlantısını ${current ? "güncelledi" : "oluşturdu"} (telefon kimliği: ${saved.phoneNumberId}).`,
  );

  return NextResponse.json({ ok: true });
}
