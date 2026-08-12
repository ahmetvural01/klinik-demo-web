import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PROFESSIONS } from "@/lib/professions";
import { ensureDefaultCelebrationDays } from "@/lib/celebration-days";

// Süperadmin'in yönettiği, tüm kliniklerin görebileceği sistem geneli
// meslek/resmi gün kutlama kataloğu (bkz. prisma/schema.prisma CelebrationDay).
// Klinikler her satırı kendi CelebrationDaySetting'i ile ayrı ayrı açar/kapatır
// (bkz. /api/celebration-days).
export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  await ensureDefaultCelebrationDays();
  const days = await prisma.celebrationDay.findMany({ orderBy: [{ month: "asc" }, { day: "asc" }] });
  return NextResponse.json(days);
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
    month?: number;
    day?: number;
    category?: string;
    recurrenceRule?: string;
    weekOfMonth?: number | null;
    weekday?: number | null;
    dateOverrides?: string[];
    targetProfessions?: string[];
    messageTemplate?: string;
    whatsappMessageTemplate?: string;
    whatsappTemplateName?: string;
    whatsappTemplateLanguage?: string;
    isActive?: boolean;
  };

  if (!body.code?.trim() || !body.title?.trim() || !body.messageTemplate?.trim()) {
    return NextResponse.json({ message: "Kod, başlık ve mesaj içeriği zorunlu" }, { status: 400 });
  }
  if (!Number.isInteger(body.month) || body.month! < 1 || body.month! > 12) {
    return NextResponse.json({ message: "Geçerli bir ay (1-12) girin" }, { status: 400 });
  }
  if (!Number.isInteger(body.day) || body.day! < 1 || body.day! > 31) {
    return NextResponse.json({ message: "Geçerli bir gün (1-31) girin" }, { status: 400 });
  }
  const targetProfessions = Array.isArray(body.targetProfessions) ? body.targetProfessions : [];
  const invalidProfessions = targetProfessions.filter((p) => !(PROFESSIONS as readonly string[]).includes(p));
  if (invalidProfessions.length > 0) {
    return NextResponse.json({ message: `Geçersiz meslek: ${invalidProfessions.join(", ")}` }, { status: 400 });
  }

  const existing = await prisma.celebrationDay.findUnique({ where: { code: body.code.trim() } });
  if (existing) {
    return NextResponse.json({ message: "Bu kod zaten kullanılıyor" }, { status: 409 });
  }

  const created = await prisma.celebrationDay.create({
    data: {
      code: body.code.trim(),
      title: body.title.trim(),
      category: body.category?.trim() || "GENERAL",
      month: body.month!,
      day: body.day!,
      recurrenceRule: body.recurrenceRule?.trim() || "FIXED",
      weekOfMonth: body.weekOfMonth ?? null,
      weekday: body.weekday ?? null,
      dateOverrides: Array.isArray(body.dateOverrides) ? body.dateOverrides : [],
      targetProfessions,
      messageTemplate: body.messageTemplate.trim(),
      whatsappMessageTemplate: body.whatsappMessageTemplate?.trim() || null,
      whatsappTemplateName: body.whatsappTemplateName?.trim() || null,
      whatsappTemplateLanguage: body.whatsappTemplateLanguage?.trim() || "tr",
      isActive: body.isActive ?? true,
    },
  });

  await writeAudit(auth.user.id, "CELEBRATION_DAY_CREATE", `Kutlama günü oluşturuldu: ${created.title} (${created.code})`);

  return NextResponse.json(created);
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
    month?: number;
    day?: number;
    category?: string;
    recurrenceRule?: string;
    weekOfMonth?: number | null;
    weekday?: number | null;
    dateOverrides?: string[];
    targetProfessions?: string[];
    messageTemplate?: string;
    whatsappMessageTemplate?: string;
    whatsappTemplateName?: string;
    whatsappTemplateLanguage?: string;
    isActive?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ message: "id zorunlu" }, { status: 400 });
  }

  const existing = await prisma.celebrationDay.findUnique({ where: { id: body.id } });
  if (!existing) {
    return NextResponse.json({ message: "Kayıt bulunamadı" }, { status: 404 });
  }

  if (body.month !== undefined && (!Number.isInteger(body.month) || body.month < 1 || body.month > 12)) {
    return NextResponse.json({ message: "Geçerli bir ay (1-12) girin" }, { status: 400 });
  }
  if (body.day !== undefined && (!Number.isInteger(body.day) || body.day < 1 || body.day > 31)) {
    return NextResponse.json({ message: "Geçerli bir gün (1-31) girin" }, { status: 400 });
  }
  if (body.targetProfessions !== undefined) {
    const invalidProfessions = body.targetProfessions.filter((p) => !(PROFESSIONS as readonly string[]).includes(p));
    if (invalidProfessions.length > 0) {
      return NextResponse.json({ message: `Geçersiz meslek: ${invalidProfessions.join(", ")}` }, { status: 400 });
    }
  }

  const updated = await prisma.celebrationDay.update({
    where: { id: body.id },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.category !== undefined ? { category: body.category.trim() || "GENERAL" } : {}),
      ...(body.month !== undefined ? { month: body.month } : {}),
      ...(body.day !== undefined ? { day: body.day } : {}),
      ...(body.recurrenceRule !== undefined ? { recurrenceRule: body.recurrenceRule.trim() || "FIXED" } : {}),
      ...(body.weekOfMonth !== undefined ? { weekOfMonth: body.weekOfMonth } : {}),
      ...(body.weekday !== undefined ? { weekday: body.weekday } : {}),
      ...(body.dateOverrides !== undefined ? { dateOverrides: body.dateOverrides } : {}),
      ...(body.targetProfessions !== undefined ? { targetProfessions: body.targetProfessions } : {}),
      ...(body.messageTemplate !== undefined ? { messageTemplate: body.messageTemplate.trim() } : {}),
      ...(body.whatsappMessageTemplate !== undefined ? { whatsappMessageTemplate: body.whatsappMessageTemplate.trim() || null } : {}),
      ...(body.whatsappTemplateName !== undefined ? { whatsappTemplateName: body.whatsappTemplateName.trim() || null } : {}),
      ...(body.whatsappTemplateLanguage !== undefined ? { whatsappTemplateLanguage: body.whatsappTemplateLanguage.trim() || "tr" } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });

  await writeAudit(auth.user.id, "CELEBRATION_DAY_UPDATE", `Kutlama günü güncellendi: ${updated.title} (${updated.code})`);

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ message: "id zorunlu" }, { status: 400 });
  }

  const existing = await prisma.celebrationDay.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ message: "Kayıt bulunamadı" }, { status: 404 });
  }

  await prisma.celebrationDay.delete({ where: { id } });
  await writeAudit(auth.user.id, "CELEBRATION_DAY_DELETE", `Kutlama günü silindi: ${existing.title} (${existing.code})`);

  return NextResponse.json({ ok: true });
}
