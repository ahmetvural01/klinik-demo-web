import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PROFESSIONS } from "@/lib/professions";

// Süperadmin'in yönettiği, tüm kliniklerin görebileceği sistem geneli
// meslek/resmi gün kutlama kataloğu (bkz. prisma/schema.prisma CelebrationDay).
// Klinikler her satırı kendi CelebrationDaySetting'i ile ayrı ayrı açar/kapatır
// (bkz. /api/celebration-days).
// code alanı gerçek bir DB @unique kısıtı (SmsTemplate'in aksine institutionId
// yok, NULL-karşılaştırma sorunu burada söz konusu değil) — bu yüzden
// createMany({ skipDuplicates: true }) burada güvenle kullanılabilir.
const DEFAULT_CELEBRATION_DAYS = [
  {
    code: "TIP_BAYRAMI",
    title: "Tıp Bayramı",
    month: 3,
    day: 14,
    targetProfessions: ["Doktor"],
    messageTemplate: "Sayın {{patientName}}, 14 Mart Tıp Bayramı'nızı candan kutlar, sağlıklı ve mutlu bir yıl dileriz. {{institutionName}} ailesi.",
  },
  {
    code: "DIS_HEKIMLIGI_GUNU",
    title: "Diş Hekimliği Günü",
    month: 3,
    day: 6,
    targetProfessions: ["Diş Hekimi"],
    messageTemplate: "Sayın {{patientName}}, Diş Hekimliği Günü'nüzü candan kutlarız. {{institutionName}} ailesi.",
  },
  {
    code: "AVUKATLAR_GUNU",
    title: "Avukatlar Günü",
    month: 4,
    day: 5,
    targetProfessions: ["Avukat", "Hakim/Savcı"],
    messageTemplate: "Sayın {{patientName}}, 5 Nisan Avukatlar Günü'nüzü candan kutlarız. {{institutionName}} ailesi.",
  },
  {
    code: "HEMSIRELER_GUNU",
    title: "Hemşireler Günü",
    month: 5,
    day: 12,
    targetProfessions: ["Hemşire"],
    messageTemplate: "Sayın {{patientName}}, 12 Mayıs Hemşireler Günü'nüzü candan kutlarız. {{institutionName}} ailesi.",
  },
  {
    code: "OGRETMENLER_GUNU",
    title: "Öğretmenler Günü",
    month: 11,
    day: 24,
    targetProfessions: ["Öğretmen", "Akademisyen"],
    messageTemplate: "Sayın {{patientName}}, 24 Kasım Öğretmenler Günü'nüzü candan kutlarız. {{institutionName}} ailesi.",
  },
  {
    code: "MUHASEBECILER_GUNU",
    title: "Muhasebeciler Günü",
    month: 6,
    day: 1,
    targetProfessions: ["Mali Müşavir/Muhasebeci"],
    messageTemplate: "Sayın {{patientName}}, 1 Haziran Muhasebeciler Günü'nüzü candan kutlarız. {{institutionName}} ailesi.",
  },
  {
    code: "BASIN_BAYRAMI",
    title: "Basın Bayramı",
    month: 7,
    day: 24,
    targetProfessions: ["Gazeteci"],
    messageTemplate: "Sayın {{patientName}}, 24 Temmuz Basın Bayramı'nızı candan kutlarız. {{institutionName}} ailesi.",
  },
  {
    code: "YILBASI",
    title: "Yılbaşı",
    month: 1,
    day: 1,
    targetProfessions: [],
    messageTemplate: "Sayın {{patientName}}, yeni yılınızı candan kutlar, sağlık ve mutluluk dolu bir yıl dileriz. {{institutionName}} ailesi.",
  },
  {
    code: "CUMHURIYET_BAYRAMI",
    title: "Cumhuriyet Bayramı",
    month: 10,
    day: 29,
    targetProfessions: [],
    messageTemplate: "Sayın {{patientName}}, 29 Ekim Cumhuriyet Bayramı'nızı kutlarız. {{institutionName}} ailesi.",
  },
] satisfies { code: string; title: string; month: number; day: number; targetProfessions: string[]; messageTemplate: string }[];

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

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
    targetProfessions?: string[];
    messageTemplate?: string;
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
      month: body.month!,
      day: body.day!,
      targetProfessions,
      messageTemplate: body.messageTemplate.trim(),
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
    targetProfessions?: string[];
    messageTemplate?: string;
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
      ...(body.month !== undefined ? { month: body.month } : {}),
      ...(body.day !== undefined ? { day: body.day } : {}),
      ...(body.targetProfessions !== undefined ? { targetProfessions: body.targetProfessions } : {}),
      ...(body.messageTemplate !== undefined ? { messageTemplate: body.messageTemplate.trim() } : {}),
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
