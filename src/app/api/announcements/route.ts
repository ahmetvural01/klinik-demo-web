import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";

export async function GET() {
  const auth = await requireAuth("announcements:read");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  try {
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        ...(auth.user.role !== "SUPERADMIN" || auth.user.institutionId
          ? { institutionId: auth.user.institutionId }
          : { institutionId: { not: null } }),
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endsAt: null },
              { endsAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json(announcements);
  } catch (error) {
    console.error("[announcements GET] fallback:", error);
    return NextResponse.json({ message: "Duyurular yüklenemedi." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth("announcements:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Duyuru boş olamaz" }, { status: 400 });
  if (text.length > 2_000) return NextResponse.json({ error: "Duyuru en fazla 2000 karakter olabilir" }, { status: 400 });

  try {
    const ann = await prisma.announcement.create({
      data: {
        institutionId: auth.user.institutionId,
        text,
        createdById: auth.user.id,
      },
    });
    await writeAudit(auth.user.id, "ANNOUNCEMENT_CREATE", text);
    return NextResponse.json(ann);
  } catch (error) {
    console.error("[announcements POST] fallback:", error);
    return NextResponse.json({ error: "Duyuru oluşturulamadı" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAuth("announcements:write");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Duyuru kimliği zorunludur" }, { status: 400 });
  try {
    const result = await prisma.announcement.updateMany({
      where: { id, institutionId: auth.user.institutionId },
      data: { isActive: false },
    });
    if (result.count !== 1) {
      return NextResponse.json({ error: "Duyuru bulunamadı" }, { status: 404 });
    }
    await writeAudit(auth.user.id, "ANNOUNCEMENT_DELETE", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[announcements DELETE] fallback:", error);
    return NextResponse.json({ error: "Duyuru silinemedi" }, { status: 503 });
  }
}
