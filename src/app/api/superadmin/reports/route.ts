import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const [totalIncome, totalSmsUsed, activeClinicCount, invoiceStats, smsTransactions] = await Promise.all([
    prisma.invoice.aggregate({
      _sum: { amount: true },
      where: { status: "PAID" },
    }),
    prisma.smsTransaction.aggregate({
      _sum: { quantity: true },
    }),
    prisma.institution.count({ where: { isActive: true } }),
    prisma.invoice.findMany({
      where: { status: "PAID", createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.smsTransaction.findMany({
      include: { institution: true, smsPackage: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const previousMonthIncome = await prisma.invoice.aggregate({
    _sum: { amount: true },
    where: {
      status: "PAID",
      createdAt: {
        gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        lte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
  });

  const currentMonth = Number(totalIncome._sum.amount || 0);
  const previousMonth = Number(previousMonthIncome._sum.amount || 0);
  const monthlyGrowth = previousMonth > 0 ? Math.round(((currentMonth - previousMonth) / previousMonth) * 100) : 0;

  // Top clinics by SMS usage
  const clinicUsage = new Map<
    string,
    { name: string; smsUsed: number; revenue: number }
  >();

  smsTransactions.forEach((t) => {
    const key = t.institutionId;
    if (!clinicUsage.has(key)) {
      clinicUsage.set(key, {
        name: t.institution.name,
        smsUsed: 0,
        revenue: 0,
      });
    }
    const stats = clinicUsage.get(key)!;
    stats.smsUsed += t.smsPackage.smsCount * t.quantity;
    stats.revenue += Number(t.totalPrice);
  });

  const topClinicsByUsage = Array.from(clinicUsage.values())
    .sort((a, b) => b.smsUsed - a.smsUsed)
    .slice(0, 10);

  return NextResponse.json({
    totalIncome: currentMonth,
    totalSmsUsed: totalSmsUsed._sum.quantity || 0,
    activeClinicCount,
    monthlyGrowth,
    topClinicsByUsage,
  });
}
