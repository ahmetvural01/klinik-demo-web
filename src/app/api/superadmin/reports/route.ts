import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { turkeyDateKey, turkeyMonthRangeUtc } from "@/lib/tz";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const [currentYear, currentMonthNum] = turkeyDateKey().split("-").map(Number);
  const currentRange = turkeyMonthRangeUtc(currentYear, currentMonthNum);
  const prevMonthDate = new Date(Date.UTC(currentYear, currentMonthNum - 2, 1));
  const previousRange = turkeyMonthRangeUtc(prevMonthDate.getUTCFullYear(), prevMonthDate.getUTCMonth() + 1);

  const [totalIncome, totalSmsUsed, activeClinicCount, previousMonthIncome, smsTransactions] = await Promise.all([
    prisma.invoice.aggregate({
      _sum: { amount: true },
      where: { status: "PAID", createdAt: { gte: currentRange.start, lte: currentRange.end } },
    }),
    prisma.smsTransaction.aggregate({
      _sum: { quantity: true },
    }),
    prisma.institution.count({ where: { isActive: true } }),
    prisma.invoice.aggregate({
      _sum: { amount: true },
      where: { status: "PAID", createdAt: { gte: previousRange.start, lte: previousRange.end } },
    }),
    prisma.smsTransaction.findMany({
      include: { institution: true, smsPackage: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

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
