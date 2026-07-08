/**
 * POST /api/taksit-plani/mark-gecikti
 * ─────────────────────────────────────
 * Vadesi geçmiş BEKLIYOR taksitlerini otomatik GECIKTI olarak işaretler.
 * Muhasebe sayfası açılışında veya günlük cron ile çağrılabilir.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, bumpRealtimeInstitution } from "@/lib/api";

export async function POST() {
  try {
    const auth = await requireAuth("payments:write");
    if (auth.error) return auth.error;
    if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
      return NextResponse.json({ updated: 0 }, { status: 403 });
    }

    const now = new Date();
    const tenantWhere = auth.user.role !== "SUPERADMIN"
      ? { plan: { patient: { institutionId: auth.user.institutionId } } }
      : {};

    // Vadesi geçmiş BEKLIYOR taksitleri GECIKTI yap
    const result = await (prisma as any).taksit.updateMany({
      where: {
        ...tenantWhere,
        status:   "BEKLIYOR",
        vadeDate: { lt: now },
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
    }
    return NextResponse.json({ updated: result.count });
  } catch {
    return NextResponse.json({ updated: 0 });
  }
}

export async function GET() {
  const auth = await requireAuth("payments:read");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN" && !auth.user.institutionId) {
    return NextResponse.json({ pending: 0 }, { status: 403 });
  }

  const now = new Date();
  const count = await (prisma as any).taksit.count({
    where: {
      ...(auth.user.role !== "SUPERADMIN"
        ? { plan: { patient: { institutionId: auth.user.institutionId } } }
        : {}),
      status: "BEKLIYOR",
      vadeDate: { lt: now },
    },
  });

  return NextResponse.json({ pending: count });
}
