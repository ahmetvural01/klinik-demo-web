/**
 * POST /api/taksit-plani/mark-gecikti
 * ─────────────────────────────────────
 * Vadesi geçmiş BEKLIYOR taksitlerini otomatik GECIKTI olarak işaretler.
 * Muhasebe sayfası açılışında veya günlük cron ile çağrılabilir.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function POST() {
  const auth = await requireAuth("payments:write");
  if (auth.error) return auth.error;

  const now = new Date();

  // Vadesi geçmiş BEKLIYOR taksitleri GECIKTI yap
  const result = await (prisma as any).taksit.updateMany({
    where: {
      status:   "BEKLIYOR",
      vadeDate: { lt: now },
    },
    data: { status: "GECIKTI" },
  });

  // GECIKTI taksiti olan planları DEVAM_EDIYOR yap (TAMAMLANDI değilse)
  if (result.count > 0) {
    const geciktiPlanIds: { planId: string }[] = await (prisma as any).taksit.findMany({
      where:  { status: "GECIKTI" },
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

  return NextResponse.json({ updated: result.count });
}

export async function GET() {
  const auth = await requireAuth("payments:read");
  if (auth.error) return auth.error;

  const now = new Date();
  const count = await (prisma as any).taksit.count({
    where: { status: "BEKLIYOR", vadeDate: { lt: now } },
  });

  return NextResponse.json({ pending: count });
}
