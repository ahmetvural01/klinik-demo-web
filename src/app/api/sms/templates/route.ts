import { NextRequest, NextResponse } from "next/server";
import { hasEffectivePermission, requireAnyAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ensureDefaultCommunicationTemplates } from "@/lib/default-communication-templates";

type MergedTemplate = {
  code: string;
  title: string;
  description: string | null;
  category: string;
  content: string;
  whatsappContent: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string;
  isActive: boolean;
  isCustom: boolean;
  hasDefault: boolean;
  defaultTitle?: string;
  defaultContent?: string;
  defaultWhatsappContent?: string | null;
  updatedAt: string;
};

// GET - Sistem varsayılanları + kliniğin kendi özelleştirdiği/eklediği
// şablonları TEK bir listede birleştirip döner. Bir kod için klinik satırı
// varsa o gösterilir (isCustom:true), yoksa süperadmin varsayılanı.
export async function GET() {
  const auth = await requireAnyAuth(["sms:read", "whatsapp:read"]);
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları SMS şablonlarını görüntüleyebilir." }, { status: 403 });
  }

  const [canReadSms, canReadWhatsappPermission, institution] = await Promise.all([
    hasEffectivePermission(auth.user, "sms:read"),
    hasEffectivePermission(auth.user, "whatsapp:read"),
    prisma.institution.findUnique({
      where: { id: auth.user.institutionId },
      select: { whatsappEnabled: true },
    }),
  ]);
  const canReadWhatsapp = Boolean(institution?.whatsappEnabled && canReadWhatsappPermission);
  if (!canReadSms && !canReadWhatsapp) {
    return NextResponse.json({ message: "İletişim şablonlarını görüntüleme yetkiniz yok." }, { status: 403 });
  }

  await ensureDefaultCommunicationTemplates();
  const [defaults, custom] = await Promise.all([
    prisma.smsTemplate.findMany({ where: { institutionId: null }, orderBy: { createdAt: "asc" } }),
    prisma.smsTemplate.findMany({ where: { institutionId: auth.user.institutionId }, orderBy: { createdAt: "asc" } }),
  ]);

  const customByCode = new Map(custom.map((t) => [t.code, t]));
  const merged: MergedTemplate[] = defaults.map((d) => {
    const override = customByCode.get(d.code);
    return override
      ? {
          code: d.code, title: override.title, description: override.description ?? d.description,
          category: override.category || d.category, content: override.content,
          whatsappContent: override.whatsappContent ?? d.whatsappContent,
          whatsappTemplateName: override.whatsappTemplateName ?? d.whatsappTemplateName,
          whatsappTemplateLanguage: override.whatsappTemplateLanguage || d.whatsappTemplateLanguage,
          isActive: override.isActive, isCustom: true, hasDefault: true,
          defaultTitle: d.title, defaultContent: d.content, defaultWhatsappContent: d.whatsappContent,
          updatedAt: override.updatedAt.toISOString(),
        }
      : {
          code: d.code, title: d.title, description: d.description, category: d.category,
          content: d.content, whatsappContent: d.whatsappContent,
          whatsappTemplateName: d.whatsappTemplateName,
          whatsappTemplateLanguage: d.whatsappTemplateLanguage,
          isActive: d.isActive, isCustom: false, hasDefault: true, updatedAt: d.updatedAt.toISOString(),
        };
  });

  // Kliniğin varsayılanlarda karşılığı olmayan tamamen kendi eklediği şablonlar
  const defaultCodes = new Set(defaults.map((d) => d.code));
  for (const t of custom) {
    if (!defaultCodes.has(t.code)) {
      merged.push({
        code: t.code, title: t.title, description: t.description, category: t.category,
        content: t.content, whatsappContent: t.whatsappContent,
        whatsappTemplateName: t.whatsappTemplateName,
        whatsappTemplateLanguage: t.whatsappTemplateLanguage,
        isActive: t.isActive, isCustom: true, hasDefault: false, updatedAt: t.updatedAt.toISOString(),
      });
    }
  }

  const visibleTemplates = merged.map((template) => ({
    ...template,
    content: canReadSms ? template.content : (template.whatsappContent || ""),
    defaultContent: canReadSms ? template.defaultContent : undefined,
    whatsappContent: canReadWhatsapp ? template.whatsappContent : null,
    whatsappTemplateName: canReadWhatsapp ? template.whatsappTemplateName : null,
    whatsappTemplateLanguage: canReadWhatsapp ? template.whatsappTemplateLanguage : "tr",
    defaultWhatsappContent: canReadWhatsapp ? template.defaultWhatsappContent : undefined,
  }));

  return NextResponse.json({ templates: visibleTemplates });
}

// POST - Kliniğin kendi şablonunu oluşturur/günceller (bilinen bir kodu
// override edebilir VEYA tamamen yeni bir kod ile özel şablon ekleyebilir).
export async function POST(request: NextRequest) {
  const auth = await requireAnyAuth(["sms:write", "whatsapp:write"]);
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları SMS şablonu oluşturabilir." }, { status: 403 });
  }

  const body = await request.json() as {
    code?: string;
    title?: string;
    description?: string;
    category?: string;
    content?: string;
    whatsappContent?: string;
    whatsappTemplateName?: string;
    whatsappTemplateLanguage?: string;
    isActive?: boolean;
  };
  const code = (body.code || "").trim().toUpperCase();

  if (!code || !body.title?.trim()) {
    return NextResponse.json({ message: "Şablon kodu ve başlığı zorunludur." }, { status: 400 });
  }

  await ensureDefaultCommunicationTemplates();
  const [canWriteSms, canWriteWhatsappPermission, institution, existing, systemDefault] = await Promise.all([
    hasEffectivePermission(auth.user, "sms:write"),
    hasEffectivePermission(auth.user, "whatsapp:write"),
    prisma.institution.findUnique({
      where: { id: auth.user.institutionId },
      select: { whatsappEnabled: true },
    }),
    prisma.smsTemplate.findFirst({ where: { institutionId: auth.user.institutionId, code } }),
    prisma.smsTemplate.findFirst({ where: { institutionId: null, code } }),
  ]);
  const canWriteWhatsapp = Boolean(institution?.whatsappEnabled && canWriteWhatsappPermission);
  const canManageShared = canWriteSms && (!institution?.whatsappEnabled || canWriteWhatsapp);
  if (!canWriteSms && !canWriteWhatsapp) {
    return NextResponse.json({ message: "İletişim şablonlarını düzenleme yetkiniz yok." }, { status: 403 });
  }

  const content = canWriteSms
    ? String(body.content || "").trim()
    : existing?.content || systemDefault?.content || "";
  if (!content) {
    return NextResponse.json(
      { message: canWriteSms ? "SMS içeriği zorunludur." : "Yeni özel şablon oluşturmak için SMS düzenleme yetkisi gerekir." },
      { status: 400 },
    );
  }
  const whatsappContent = canWriteWhatsapp
    ? body.whatsappContent === undefined
      ? existing?.whatsappContent ?? systemDefault?.whatsappContent ?? null
      : body.whatsappContent.trim() || null
    : existing?.whatsappContent ?? systemDefault?.whatsappContent ?? null;
  const whatsappTemplateName = canWriteWhatsapp
    ? body.whatsappTemplateName === undefined
      ? existing?.whatsappTemplateName ?? systemDefault?.whatsappTemplateName ?? null
      : body.whatsappTemplateName.trim() || null
    : existing?.whatsappTemplateName ?? systemDefault?.whatsappTemplateName ?? null;
  const whatsappTemplateLanguage = canWriteWhatsapp
    ? body.whatsappTemplateLanguage === undefined
      ? existing?.whatsappTemplateLanguage || systemDefault?.whatsappTemplateLanguage || "tr"
      : body.whatsappTemplateLanguage.trim() || "tr"
    : existing?.whatsappTemplateLanguage || systemDefault?.whatsappTemplateLanguage || "tr";
  const isActive = canManageShared
    ? body.isActive ?? existing?.isActive ?? systemDefault?.isActive ?? true
    : existing?.isActive ?? systemDefault?.isActive ?? true;

  // institutionId burada her zaman dolu (null değil), bu yüzden native
  // upsert @@unique([institutionId, code]) kısıtına güvenli şekilde dayanır.
  const template = await prisma.smsTemplate.upsert({
    where: { institutionId_code: { institutionId: auth.user.institutionId, code } },
    update: {
      title: body.title.trim(), description: body.description?.trim() || null,
      category: body.category?.trim() || "GENERAL", content,
      whatsappContent,
      whatsappTemplateName,
      whatsappTemplateLanguage,
      isActive,
    },
    create: {
      institutionId: auth.user.institutionId, code, title: body.title.trim(),
      description: body.description?.trim() || null, category: body.category?.trim() || "GENERAL",
      content, whatsappContent,
      whatsappTemplateName,
      whatsappTemplateLanguage,
      isActive,
    },
  });

  await writeAudit(auth.user.id, "SMS_TEMPLATE_CUSTOM_SAVE", `Kurum SMS şablonu kaydedildi: ${template.code}`);

  return NextResponse.json({ ...template, isCustom: true, updatedAt: template.updatedAt.toISOString() });
}

// DELETE - Kliniğin kendi şablonunu siler, kod tekrar sistem varsayılanına döner.
export async function DELETE(request: NextRequest) {
  const auth = await requireAnyAuth(["sms:write", "whatsapp:write"]);
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları SMS şablonu silebilir." }, { status: 403 });
  }

  const [canWriteSms, canWriteWhatsappPermission, institution] = await Promise.all([
    hasEffectivePermission(auth.user, "sms:write"),
    hasEffectivePermission(auth.user, "whatsapp:write"),
    prisma.institution.findUnique({
      where: { id: auth.user.institutionId },
      select: { whatsappEnabled: true },
    }),
  ]);
  const canWriteWhatsapp = Boolean(institution?.whatsappEnabled && canWriteWhatsappPermission);
  if (!canWriteSms || (institution?.whatsappEnabled && !canWriteWhatsapp)) {
    return NextResponse.json(
      { message: "Birleşik şablonu sıfırlamak için SMS ve WhatsApp düzenleme yetkileri gerekir." },
      { status: 403 },
    );
  }

  const code = (request.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ message: "Silinecek şablon kodu zorunludur." }, { status: 400 });
  }

  // institutionId filtresi kritik: bu filtre olmadan başka bir kurumun
  // şablonunu silme riski olurdu.
  const existing = await prisma.smsTemplate.findFirst({ where: { institutionId: auth.user.institutionId, code } });
  if (!existing) {
    return NextResponse.json({ message: "Özel şablon bulunamadı" }, { status: 404 });
  }

  await prisma.smsTemplate.delete({ where: { id: existing.id } });
  await writeAudit(auth.user.id, "SMS_TEMPLATE_CUSTOM_RESET", `Kurum SMS şablonu silindi; varsayılan şablona dönüldü: ${code}`);

  return NextResponse.json({ ok: true });
}
