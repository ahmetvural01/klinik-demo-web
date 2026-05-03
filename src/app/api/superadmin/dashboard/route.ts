import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const now = new Date();

  const [
    institutions,
    activeInstitutions,
    suspendedInstitutions,
    totalSmsBalanceAgg,
    totalRevenue,
    pendingInvoices,
    overdueInvoices,
    unpaidAmountAgg,
    recentTransactions,
    wallet,
    planDistribution,
    lowSmsInstitutions,
    recentInstitutions,
  ] = await Promise.all([
    prisma.institution.count(),
    prisma.institution.count({ where: { isActive: true } }),
    prisma.institution.count({ where: { serviceMode: { in: ["SUSPENDED", "READ_ONLY", "LIMITED"] } } }),
    prisma.institution.aggregate({ _sum: { smsBalance: true } }),
    prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: "PAID" } }),
    prisma.invoice.count({ where: { status: "PENDING" } }),
    prisma.invoice.count({ where: { status: { not: "PAID" }, dueDate: { lt: now } } }),
    prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: { not: "PAID" } } }),
    prisma.smsTransaction.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { smsPackage: true, institution: { select: { id: true, name: true } } },
    }),
    prisma.platformSmsWallet.findUnique({ where: { id: 1 } }),
    prisma.institution.groupBy({ by: ["subscriptionPlan"], _count: { _all: true } }),
    prisma.institution.findMany({
      where: { smsBalance: { lt: 50 }, isActive: true },
      select: { id: true, name: true, smsBalance: true },
      orderBy: { smsBalance: "asc" },
      take: 5,
    }),
    prisma.institution.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, subscriptionPlan: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    totalInstitutions: institutions,
    activeInstitutions,
    suspendedInstitutions,
    totalSmsBalance: totalSmsBalanceAgg._sum.smsBalance || 0,
    platformSmsStock: wallet?.availableBalance ?? 0,
    totalRevenue: Number(totalRevenue._sum.amount || 0),
    pendingInvoices,
    overdueInvoices,
    unpaidAmount: Number(unpaidAmountAgg._sum.amount || 0),
    planDistribution: planDistribution.map((p) => ({ plan: p.subscriptionPlan, count: p._count._all })),
    lowSmsInstitutions,
    recentInstitutions: recentInstitutions.map((i) => ({
      id: i.id,
      name: i.name,
      subscriptionPlan: i.subscriptionPlan,
      createdAt: i.createdAt.toISOString(),
    })),
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      institutionId: t.institution.id,
      institution: t.institution.name,
      smsCount: t.smsPackage.smsCount * t.quantity,
      amount: Number(t.totalPrice),
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
