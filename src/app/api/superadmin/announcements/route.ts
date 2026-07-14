import { NextRequest, NextResponse } from "next/server";
import { requireAuth, writeAudit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page  = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = 20;
  const skip  = (page - 1) * limit;

  const [total, announcements] = await Promise.all([
    prisma.announcement.count(),
    prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { institution: { select: { id: true, name: true, isDemo: true } } },
    }),
  ]);

  return NextResponse.json({ announcements, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const body = await request.json() as { text: string; institutionIds?: string[]; allInstitutions?: boolean; endsAt?: string | null };
  if (!body.text?.trim()) return NextResponse.json({ message: "text zorunlu" }, { status: 400 });

  const targetInstitutions = body.allInstitutions
    ? await prisma.institution.findMany({ where: { isActive: true }, select: { id: true } })
    : await prisma.institution.findMany({
        where: { id: { in: Array.isArray(body.institutionIds) ? body.institutionIds : [] }, isActive: true },
        select: { id: true },
      });

  const uniqueInstitutions = targetInstitutions.filter((institution, index, list) =>
    list.findIndex((item) => item.id === institution.id) === index,
  );

  if (uniqueInstitutions.length === 0) {
    return NextResponse.json({ message: "En az bir kurum seçilmeli" }, { status: 400 });
  }

  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (body.endsAt && Number.isNaN(endsAt?.getTime())) {
    return NextResponse.json({ message: "Bitiş tarihi geçersiz" }, { status: 400 });
  }

  const result = await prisma.announcement.createMany({
    data: uniqueInstitutions.map((institution) => ({
      institutionId: institution.id,
      text: body.text.trim(),
      createdById: auth.user.id,
      endsAt,
    })),
  });

  await writeAudit(auth.user.id, "SUPERADMIN_ANNOUNCEMENT_CREATE", `${result.count} kurum için duyuru oluşturuldu: ${body.text.trim().slice(0, 120)}`);
  return NextResponse.json({ ok: true, created: result.count }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") return NextResponse.json({ message: "Yetki yok" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id zorunlu" }, { status: 400 });

  const existing = await prisma.announcement.findUnique({ where: { id }, select: { text: true } });
  await prisma.announcement.updateMany({ where: { id }, data: { isActive: false } });
  await writeAudit(auth.user.id, "SUPERADMIN_ANNOUNCEMENT_DELETE", `Duyuru pasifleştirildi: ${existing?.text?.slice(0, 120) || id}`);
  return NextResponse.json({ ok: true });
}
