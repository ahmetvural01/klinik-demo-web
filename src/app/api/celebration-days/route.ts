import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Klinik, süperadmin'in yönettiği kutlama günü kataloğunu (bkz.
// /api/superadmin/celebration-days) burada görür ve her satırı kendi
// CelebrationDaySetting'i ile ayrı ayrı açar/kapatır (varsayılan kapalı —
// bkz. src/lib/celebration-sms.ts).
export async function GET() {
  const auth = await requireAuth("sms:read");
  if (auth.error) return auth.error;
  if (!auth.user.institutionId) {
    return NextResponse.json({ message: "Yalnızca klinik kullanıcıları görüntüleyebilir." }, { status: 403 });
  }

  const [days, settings] = await Promise.all([
    prisma.celebrationDay.findMany({ where: { isActive: true }, orderBy: [{ month: "asc" }, { day: "asc" }] }),
    prisma.celebrationDaySetting.findMany({ where: { institutionId: auth.user.institutionId } }),
  ]);

  const enabledByCode = new Map(settings.map((s) => [s.celebrationCode, s.enabled]));
  const merged = days.map((d) => ({
    code: d.code,
    title: d.title,
    month: d.month,
    day: d.day,
    targetProfessions: d.targetProfessions,
    enabled: enabledByCode.get(d.code) ?? false,
  }));

  return NextResponse.json({ days: merged });
}
