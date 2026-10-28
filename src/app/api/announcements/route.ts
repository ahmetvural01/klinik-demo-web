import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

/**
 * Kliniğe gösterilen platform duyuruları (ör. "28.08.2026 Çarşamba 13:00–15:00
 * arası sistem bakımı"). Duyuruyu yalnız sistem sahibi Süperadmin > Duyurular
 * ekranından verir; klinik içi duyuru ve ekip mesajı kaldırıldı (ürün sahibinin
 * kararı). Her oturum açmış klinik kullanıcısı görür (izin gerekmez): bakım
 * bildirimi herkese ulaşmalı. Yalnız yayın aralığındaki kayıtlar döner.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json([]);

  try {
    const now = new Date();
    const platformAdmins = await prisma.user.findMany({ where: { role: "SUPERADMIN" }, select: { id: true } });
    const announcements = await prisma.announcement.findMany({
      where: {
        institutionId,
        isActive: true,
        createdById: { in: platformAdmins.map((admin) => admin.id) },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, text: true, startsAt: true, endsAt: true, createdAt: true },
    });
    return NextResponse.json(announcements);
  } catch (error) {
    console.error("[announcements GET]", error);
    return NextResponse.json({ message: "Duyurular yüklenemedi." }, { status: 503 });
  }
}
