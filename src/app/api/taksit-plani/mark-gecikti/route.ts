/**
 * POST /api/taksit-plani/mark-gecikti
 * ─────────────────────────────────────
 * Vadesi geçmiş BEKLIYOR taksitlerini otomatik GECIKTI olarak işaretler.
 * Muhasebe sayfası açılışında veya günlük cron ile çağrılabilir.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, bumpRealtimeInstitution, writeAudit } from "@/lib/api";
import { turkeyTodayStartUtc } from "@/lib/tz";

export async function POST() {
  try {
    const auth = await requireAuth("installments:write");
    if (auth.error) return auth.error;
    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ updated: 0 }, { status: 403 });
    }

    // Vade günü Türkiye takvimiyle henüz "bugün" ise gecikmiş sayılmaz — sadece
    // Türkiye takviminde vade gününden sonraki gün başlayınca gecikti işaretlenir.
    const cutoff = turkeyTodayStartUtc();
    const tenantWhere = auth.user.role !== "SUPERADMIN"
      ? { plan: { patient: { institutionId: auth.user.institutionId } } }
      : {};

    // Vadesi geçmiş BEKLIYOR taksitleri GECIKTI yap
    const result = await (prisma as any).taksit.updateMany({
      where: {
        ...tenantWhere,
        status:   "BEKLIYOR",
        vadeDate: { lt: cutoff },
      },
      data: { status: "GECIKTI" },
    });

    // GECIKTI taksiti olan planları DEVAM_EDIYOR yap (TAMAMLANDI değilse)
    if (result.count > 0) {
      const geciktiPlanIds: { planId: string }[] = await (prisma as any).taksit.findMany({
        where:  { ...tenantWhere, status: "GECIKTI" },
        select: { planId: true },
        distinct: ["planId"],
      });
      const ids = [...new Set(geciktiPlanIds.map((r: { planId: string }) => r.planId))];
      if (ids.length > 0) {
        await (prisma as any).taksitPlan.updateMany({
          where: { id: { in: ids }, status: { notIn: ["TAMAMLANDI", "IPTAL"] } },
          data:  { status: "DEVAM_EDIYOR" },
        });
      }
    }

    if (result.count > 0) {
      bumpRealtimeInstitution(auth.user.institutionId);
      await writeAudit(
        auth.user.id,
        "TAKSIT_MARK_OVERDUE",
        `${result.count} taksit otomatik olarak gecikti durumuna alındı. Kesim tarihi: ${cutoff.toISOString()}`
      );
    }
    return NextResponse.json({ updated: result.count });
  } catch {
    return NextResponse.json({ updated: 0 });
  }
}

export async function GET() {
  const auth = await requireAuth("installments:read");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
    return NextResponse.json({ pending: 0 }, { status: 403 });
  }

  const count = await (prisma as any).taksit.count({
    where: {
      ...(auth.user.role !== "SUPERADMIN"
        ? { plan: { patient: { institutionId: auth.user.institutionId } } }
        : {}),
      status: "BEKLIYOR",
      vadeDate: { lt: turkeyTodayStartUtc() },
    },
  });

  return NextResponse.json({ pending: count });
}
