import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { turkeyDateKey, turkeyMonthRangeUtc } from "@/lib/tz";
import { summarizeInvoices } from "@/components/superadmin/invoice-status";

export const dynamic = "force-dynamic";

type Period = "bu-ay" | "gecen-ay" | "son-12-ay";

function monthOffset(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Seçilen dönem ve bir önceki eşit uzunluktaki dönem (Türkiye takvimi). */
function ranges(period: Period) {
  const [year, month] = turkeyDateKey().split("-").map(Number);
  if (period === "son-12-ay") {
    const first = monthOffset(year, month, -11);
    const prevFirst = monthOffset(year, month, -23);
    const prevLast = monthOffset(year, month, -12);
    return {
      current: { start: turkeyMonthRangeUtc(first.year, first.month).start, end: turkeyMonthRangeUtc(year, month).end },
      previous: { start: turkeyMonthRangeUtc(prevFirst.year, prevFirst.month).start, end: turkeyMonthRangeUtc(prevLast.year, prevLast.month).end },
    };
  }
  const target = period === "gecen-ay" ? monthOffset(year, month, -1) : { year, month };
  const prev = monthOffset(target.year, target.month, -1);
  return { current: turkeyMonthRangeUtc(target.year, target.month), previous: turkeyMonthRangeUtc(prev.year, prev.month) };
}

/**
 * Raporlar — seçilen dönemde tahsilat, kesilen fatura, satılan ve gönderilen
 * SMS. Önceden "Bu ay SMS kullanımı" satılan PAKET adedini gösteriyordu
 * (3 paket = "3"), gönderilen SMS (SmsDispatch) hiç okunmuyordu ve önceki ay
 * 0 iken büyüme "+0%" yazıyordu.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const raw = new URL(request.url).searchParams.get("donem");
  const period: Period = raw === "gecen-ay" || raw === "son-12-ay" ? raw : "bu-ay";
  const { current, previous } = ranges(period);
  const inCurrent = { gte: current.start, lte: current.end };

  const [paid, previousPaid, issued, allInvoices, smsSales, dispatches, institutions, planGroups] = await Promise.all([
    prisma.invoice.findMany({ where: { status: "PAID", paidAt: inCurrent }, select: { institutionId: true, amount: true } }),
    prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: "PAID", paidAt: { gte: previous.start, lte: previous.end } } }),
    prisma.invoice.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { createdAt: inCurrent, status: { not: "CANCELLED" } } }),
    prisma.invoice.findMany({ select: { status: true, amount: true, dueDate: true, paidAt: true } }),
    prisma.smsTransaction.findMany({
      where: { createdAt: inCurrent },
      select: { institutionId: true, quantity: true, totalPrice: true, smsPackage: { select: { smsCount: true } } },
    }),
    prisma.smsDispatch.groupBy({
      by: ["institutionId", "status"],
      where: { createdAt: inCurrent, channel: "SMS" },
      _count: { _all: true },
    }),
    prisma.institution.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.institution.groupBy({ by: ["subscriptionPlan", "billingCycle"], where: { isActive: true }, _count: { _all: true } }),
  ]);

  const names = new Map(institutions.map((item) => [item.id, item.name]));
  type Row = { id: string; name: string; sent: number; failed: number; soldSms: number; smsRevenue: number; collected: number };
  const rows = new Map<string, Row>();
  const row = (id: string): Row => {
    let entry = rows.get(id);
    if (!entry) {
      entry = { id, name: names.get(id) || "Silinmiş klinik", sent: 0, failed: 0, soldSms: 0, smsRevenue: 0, collected: 0 };
      rows.set(id, entry);
    }
    return entry;
  };

  let collected = 0;
  for (const invoice of paid) {
    const amount = Number(invoice.amount);
    collected += amount;
    row(invoice.institutionId).collected += amount;
  }
  let soldSms = 0;
  let smsRevenue = 0;
  for (const sale of smsSales) {
    const count = sale.smsPackage.smsCount * sale.quantity;
    const amount = Number(sale.totalPrice);
    soldSms += count;
    smsRevenue += amount;
    const entry = row(sale.institutionId);
    entry.soldSms += count;
    entry.smsRevenue += amount;
  }
  let sent = 0;
  let failed = 0;
  for (const group of dispatches) {
    const entry = row(group.institutionId);
    if (group.status === "SENT" || group.status === "DELIVERED" || group.status === "READ") {
      sent += group._count._all;
      entry.sent += group._count._all;
    } else if (group.status === "FAILED") {
      failed += group._count._all;
      entry.failed += group._count._all;
    }
  }

  const previousCollected = Number(previousPaid._sum.amount || 0);
  const open = summarizeInvoices(allInvoices);

  return NextResponse.json({
    period,
    range: { start: current.start.toISOString(), end: current.end.toISOString() },
    collected,
    collectedGrowth: previousCollected > 0 ? Math.round(((collected - previousCollected) / previousCollected) * 100) : null,
    issuedAmount: Number(issued._sum.amount || 0),
    issuedCount: issued._count._all,
    openAmount: open.openAmount,
    overdueAmount: open.overdueAmount,
    soldSms,
    smsRevenue,
    sentSms: sent,
    failedSms: failed,
    activeClinicCount: institutions.filter((item) => item.isActive).length,
    plans: planGroups.map((group) => ({ plan: group.subscriptionPlan, cycle: group.billingCycle, count: group._count._all })),
    clinics: [...rows.values()].sort((a, b) => b.sent - a.sent || b.collected - a.collected),
  });
}
