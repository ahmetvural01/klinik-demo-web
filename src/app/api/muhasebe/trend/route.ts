import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFast } from "@/lib/auth";

/**
 * GET /api/muhasebe/trend
 * Son 6 ayın aylık gelir ve gider toplamlarını döner.
 */
export async function GET() {
  const user = await getCurrentUserFast();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const months: { label: string; gelir: number; gider: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    d.setHours(0, 0, 0, 0);

    const start = new Date(d);
    const end = new Date(d);
    end.setMonth(end.getMonth() + 1);
    end.setMilliseconds(-1);

    const label = d.toLocaleString("tr-TR", { month: "short", year: "2-digit" });

    const [gelirRows, giderRows] = await Promise.all([
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { createdAt: { gte: start, lte: end } },
      }),
      (prisma as any).expense.aggregate({
        _sum: { tutar: true },
        where: {
          tarih: { gte: start, lte: end },
          status: { not: "IPTAL" },
        },
      }),
    ]);

    months.push({
      label,
      gelir: Number(gelirRows._sum.amount ?? 0),
      gider: Number(giderRows._sum.tutar ?? 0),
    });
  }

  return NextResponse.json(months);
}
