import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ensureDefaultCommunicationTemplates } from "@/lib/default-communication-templates";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  await ensureDefaultCommunicationTemplates();

  // Süperadmin sadece sistem varsayılanlarını (institutionId=null) yönetir —
  // kliniklerin kendi özelleştirdiği şablonlar (bkz. /api/sms/templates)
  // burada görünmez/karışmaz.
  const templates = await prisma.smsTemplate.findMany({
    where: { institutionId: null },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
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

  if (!body.code || !body.title || !body.content) {
    return NextResponse.json({ message: "Kod, baslik ve icerik zorunlu" }, { status: 400 });
  }

  // Postgres @@unique([institutionId, code]) NULL'ları çakışmayan kabul eder,
  // yani institutionId=null satırlar arasında code benzersizliğini DB kısıtı
  // GARANTİ ETMEZ — bu yüzden burada elle findFirst + create/update yapılıyor
  // (native upsert/ON CONFLICT bu durumda güvenilir çalışmaz).
  const existing = await prisma.smsTemplate.findFirst({ where: { institutionId: null, code: body.code } });
  const template = existing
    ? await prisma.smsTemplate.update({
        where: { id: existing.id },
        data: {
          title: body.title, description: body.description?.trim() || null,
          category: body.category?.trim() || "GENERAL", content: body.content,
          whatsappContent: body.whatsappContent?.trim() || null,
          whatsappTemplateName: body.whatsappTemplateName?.trim() || null,
          whatsappTemplateLanguage: body.whatsappTemplateLanguage?.trim() || "tr",
          isActive: body.isActive ?? true,
        },
      })
    : await prisma.smsTemplate.create({
        data: {
          institutionId: null, code: body.code, title: body.title,
          description: body.description?.trim() || null, category: body.category?.trim() || "GENERAL",
          content: body.content, whatsappContent: body.whatsappContent?.trim() || null,
          whatsappTemplateName: body.whatsappTemplateName?.trim() || null,
          whatsappTemplateLanguage: body.whatsappTemplateLanguage?.trim() || "tr",
          isActive: body.isActive ?? true,
        },
      });

  await writeAudit(auth.user.id, "SMS_TEMPLATE_SAVE", `SMS sablonu kaydedildi: ${template.code}`);

  return NextResponse.json(template);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const body = await request.json() as {
    id?: string;
    title?: string;
    description?: string;
    category?: string;
    content?: string;
    whatsappContent?: string;
    whatsappTemplateName?: string;
    whatsappTemplateLanguage?: string;
    isActive?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ message: "Template id zorunlu" }, { status: 400 });
  }

  const existing = await prisma.smsTemplate.findUnique({ where: { id: body.id } });
  if (!existing) {
    return NextResponse.json({ message: "Template bulunamadı" }, { status: 404 });
  }
  if (existing.institutionId !== null) {
    return NextResponse.json({ message: "Bu şablon bir kliniğe ait, süperadmin panelinden düzenlenemez" }, { status: 403 });
  }

  const template = await prisma.smsTemplate.update({
    where: { id: body.id },
    data: {
      title: body.title,
      description: body.description?.trim() || null,
      category: body.category?.trim() || existing.category,
      content: body.content,
      whatsappContent: body.whatsappContent?.trim() || null,
      whatsappTemplateName: body.whatsappTemplateName?.trim() || null,
      whatsappTemplateLanguage: body.whatsappTemplateLanguage?.trim() || "tr",
      isActive: body.isActive,
    },
  });

  const beforeParts: string[] = [];
  const afterParts: string[] = [];
  const pushDiff = (label: string, before: unknown, after: unknown) => {
    const b = before === null || before === undefined || before === "" ? "-" : String(before);
    const a = after === null || after === undefined || after === "" ? "-" : String(after);
    if (b !== a) {
      beforeParts.push(`${label}: ${b}`);
      afterParts.push(`${label}: ${a}`);
    }
  };

  pushDiff("Başlık", existing.title, template.title);
  pushDiff("İçerik", existing.content, template.content);
  pushDiff("WhatsApp İçeriği", existing.whatsappContent, template.whatsappContent);
  pushDiff("Meta Şablonu", existing.whatsappTemplateName, template.whatsappTemplateName);
  pushDiff("Durum", existing.isActive ? "Aktif" : "Pasif", template.isActive ? "Aktif" : "Pasif");

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından SMS şablonu güncellendi: ${template.code}.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "SMS_TEMPLATE_UPDATE", detail);

  return NextResponse.json(template);
}
