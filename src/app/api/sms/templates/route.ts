import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type MergedTemplate = {
  code: string;
  title: string;
  content: string;
  isActive: boolean;
  isCustom: boolean;
  hasDefault: boolean;
  defaultTitle?: string;
  defaultContent?: string;
  updatedAt: string;
};

// GET - Sistem varsayılanları + kliniğin kendi özelleştirdiği/eklediği
// şablonları TEK bir listede birleştirip döner. Bir kod için klinik satırı
// varsa o gösterilir (isCustom:true), yoksa süperadmin varsayılanı.
export async function GET() {
  const auth = await requireAuth("sms:read");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Sadece klinik kullanicilari sablonlari goruntuleyebilir" }, { status: 403 });
  }

  const [defaults, custom] = await Promise.all([
    prisma.smsTemplate.findMany({ where: { institutionId: null }, orderBy: { createdAt: "asc" } }),
    prisma.smsTemplate.findMany({ where: { institutionId: auth.user.institutionId }, orderBy: { createdAt: "asc" } }),
  ]);

  const customByCode = new Map(custom.map((t) => [t.code, t]));
  const merged: MergedTemplate[] = defaults.map((d) => {
    const override = customByCode.get(d.code);
    return override
      ? { code: d.code, title: override.title, content: override.content, isActive: override.isActive, isCustom: true, hasDefault: true, defaultTitle: d.title, defaultContent: d.content, updatedAt: override.updatedAt.toISOString() }
      : { code: d.code, title: d.title, content: d.content, isActive: d.isActive, isCustom: false, hasDefault: true, updatedAt: d.updatedAt.toISOString() };
  });

  // Kliniğin varsayılanlarda karşılığı olmayan tamamen kendi eklediği şablonlar
  const defaultCodes = new Set(defaults.map((d) => d.code));
  for (const t of custom) {
    if (!defaultCodes.has(t.code)) {
      merged.push({ code: t.code, title: t.title, content: t.content, isActive: t.isActive, isCustom: true, hasDefault: false, updatedAt: t.updatedAt.toISOString() });
    }
  }

  return NextResponse.json({ templates: merged });
}

// POST - Kliniğin kendi şablonunu oluşturur/günceller (bilinen bir kodu
// override edebilir VEYA tamamen yeni bir kod ile özel şablon ekleyebilir).
export async function POST(request: NextRequest) {
  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Sadece klinik kullanicilari sablon olusturabilir" }, { status: 403 });
  }

  const body = await request.json() as { code?: string; title?: string; content?: string; isActive?: boolean };
  const code = (body.code || "").trim().toUpperCase();

  if (!code || !body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json({ message: "Kod, baslik ve icerik zorunlu" }, { status: 400 });
  }

  // institutionId burada her zaman dolu (null değil), bu yüzden native
  // upsert @@unique([institutionId, code]) kısıtına güvenli şekilde dayanır.
  const template = await prisma.smsTemplate.upsert({
    where: { institutionId_code: { institutionId: auth.user.institutionId, code } },
    update: { title: body.title.trim(), content: body.content, isActive: body.isActive ?? true },
    create: { institutionId: auth.user.institutionId, code, title: body.title.trim(), content: body.content, isActive: body.isActive ?? true },
  });

  await writeAudit(auth.user.id, "SMS_TEMPLATE_CUSTOM_SAVE", `Kendi SMS sablonu kaydedildi: ${template.code}`);

  return NextResponse.json({ code: template.code, title: template.title, content: template.content, isActive: template.isActive, isCustom: true, updatedAt: template.updatedAt.toISOString() });
}

// DELETE - Kliniğin kendi şablonunu siler, kod tekrar sistem varsayılanına döner.
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("sms:write");
  if (auth.error) return auth.error;

  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Sadece klinik kullanicilari sablon silebilir" }, { status: 403 });
  }

  const code = (request.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ message: "code zorunlu" }, { status: 400 });
  }

  // institutionId filtresi kritik: bu filtre olmadan başka bir kurumun
  // şablonunu silme riski olurdu.
  const existing = await prisma.smsTemplate.findFirst({ where: { institutionId: auth.user.institutionId, code } });
  if (!existing) {
    return NextResponse.json({ message: "Özel şablon bulunamadı" }, { status: 404 });
  }

  await prisma.smsTemplate.delete({ where: { id: existing.id } });
  await writeAudit(auth.user.id, "SMS_TEMPLATE_CUSTOM_RESET", `Kendi SMS sablonu silindi (varsayilana donuldu): ${code}`);

  return NextResponse.json({ ok: true });
}
