import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const count = await prisma.smsTemplate.count();

  if (count === 0) {
    await prisma.smsTemplate.createMany({
      data: [
        {
          code: "BILGI",
          title: "Bilgi SMS",
          content: "{{institutionName}}: Sayin {{patientName}}, randevunuz olusturuldu. Tarih: {{dateTime}}.",
          isActive: true,
        },
        {
          code: "HATIRLATMA",
          title: "Hatirlatma SMS",
          content: "{{institutionName}}: Sayin {{patientName}}, randevu hatirlatmasi. Tarih: {{dateTime}}, Doktor: {{doctorName}}.",
          isActive: true,
        },
        {
          code: "ANKET",
          title: "Anket SMS",
          content: "{{institutionName}}: Sayin {{patientName}}, randevunuz tamamlandi. Geri bildiriminiz bizim icin degerli.",
          isActive: true,
        },
      ],
      skipDuplicates: true,
    });
  }

  const templates = await prisma.smsTemplate.findMany({
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
    content?: string;
    isActive?: boolean;
  };

  if (!body.code || !body.title || !body.content) {
    return NextResponse.json({ message: "Kod, baslik ve icerik zorunlu" }, { status: 400 });
  }

  const template = await prisma.smsTemplate.upsert({
    where: { code: body.code },
    update: {
      title: body.title,
      content: body.content,
      isActive: body.isActive ?? true,
    },
    create: {
      code: body.code,
      title: body.title,
      content: body.content,
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
    content?: string;
    isActive?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ message: "Template id zorunlu" }, { status: 400 });
  }

  const existing = await prisma.smsTemplate.findUnique({ where: { id: body.id } });
  if (!existing) {
    return NextResponse.json({ message: "Template bulunamadı" }, { status: 404 });
  }

  const template = await prisma.smsTemplate.update({
    where: { id: body.id },
    data: {
      title: body.title,
      content: body.content,
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
  pushDiff("Durum", existing.isActive ? "Aktif" : "Pasif", template.isActive ? "Aktif" : "Pasif");

  const detail = [
    `${auth.user.fullName || "Personel"} tarafından SMS şablonu güncellendi: ${template.code}.`,
    `Değişiklik öncesi: ${beforeParts.length > 0 ? beforeParts.join(" | ") : "Alan değişikliği yok"}`,
    `Değişiklik sonrası: ${afterParts.length > 0 ? afterParts.join(" | ") : "Alan değişikliği yok"}`,
  ].join("\n");

  await writeAudit(auth.user.id, "SMS_TEMPLATE_UPDATE", detail);

  return NextResponse.json(template);
}
