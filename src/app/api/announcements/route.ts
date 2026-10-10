import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, writeAudit } from "@/lib/api";
import { BRAND_NAME } from "@/lib/brand";
import { rejectGhostAuthoring } from "@/app/api/messages/message-rules";

const MAX_TEXT = 2_000;
/** Kliniğin kendi duyurusu en çok bir yıl yayında kalacak şekilde sınırlanabilir. */
const MAX_DURATION_MS = 366 * 24 * 60 * 60 * 1000;

/**
 * Duyuruyu yazanın adı: kliniğin kendi personeli adıyla, platformdan
 * (Süperadmin > Duyurular) gönderilen duyuru marka adıyla görünür. Başka
 * kurumun kullanıcısının adı hiçbir durumda dönmez.
 */
async function creatorNames(institutionId: string, createdByIds: Array<string | null>) {
  const ids = Array.from(new Set(createdByIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, role: true, institutionId: true },
  });
  return new Map(users.map((user) => [
    user.id,
    user.role === "SUPERADMIN" || user.institutionId !== institutionId ? BRAND_NAME : user.fullName,
  ]));
}

export async function GET() {
  const auth = await requireAuth("announcements:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ error: "Kurum bilgisi bulunamadı" }, { status: 403 });
  }

  try {
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        institutionId: auth.user.institutionId,
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
    const names = await creatorNames(auth.user.institutionId, announcements.map((item) => item.createdById));
    return NextResponse.json(announcements.map((item) => ({
      ...item,
      createdByName: item.createdById ? names.get(item.createdById) || null : null,
    })));
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
  const ghostRejected = rejectGhostAuthoring(auth.user, "duyuru");
  if (ghostRejected) return ghostRejected;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Duyuru boş olamaz" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "Duyuru en fazla 2000 karakter olabilir" }, { status: 400 });

  // İsteğe bağlı bitiş: modelde ve listede (GET) zaten vardı, yalnız klinik
  // ekranı veremiyordu; eski duyurular birikmesin diye "yayında kalsın" süresi.
  let endsAt: Date | null = null;
  if (body?.endsAt !== undefined && body?.endsAt !== null && body?.endsAt !== "") {
    endsAt = typeof body.endsAt === "string" ? new Date(body.endsAt) : null;
    const now = Date.now();
    if (!endsAt || Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= now || endsAt.getTime() - now > MAX_DURATION_MS) {
      return NextResponse.json({ error: "Yayın bitiş tarihi geçersiz" }, { status: 400 });
    }
  }

  try {
    const ann = await prisma.announcement.create({
      data: {
        institutionId: auth.user.institutionId,
        text,
        createdById: auth.user.id,
        endsAt,
      },
    });
    await writeAudit(auth.user.id, "ANNOUNCEMENT_CREATE", text);
    const names = await creatorNames(auth.user.institutionId, [ann.createdById]);
    return NextResponse.json({ ...ann, createdByName: ann.createdById ? names.get(ann.createdById) || null : null });
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
