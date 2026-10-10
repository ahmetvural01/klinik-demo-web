import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isValidDateKey, turkeyDateKey, turkeyDayRangeUtc, turkeyMonthRangeUtc } from "@/lib/tz";
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

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Seçilen gün aralığının karşılaştırma dönemi. Ayın 1'inden başlayan
 * dönemde aynı günler aylar kadar (yıl başından başlıyorsa bir yıl) geri
 * alınır: "1–10 Eki" ↔ "1–10 Eyl", "Eylül" ↔ "Ağustos", "Bu yıl" ↔ geçen
 * yılın aynı günleri. Diğer aralıklarda hemen önceki eşit uzunlukta dönem.
 */
function previousKeys(from: string, to: string): { from: string; to: string } {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (from.endsWith("-01")) {
    const spanMonths = (ty - fy) * 12 + (tm - fm) + 1;
    // Yıl başından başlayıp birden çok aya yayılan dönem ("Bu yıl") geçen
    // yılla karşılaştırılır. Tek aylık dönem (ör. şubatta "Geçen ay" = ocak)
    // bir önceki ayla: önceden ocak geçen yılın ocağıyla karşılaştırılıyordu.
    const months = from.endsWith("-01-01") && spanMonths > 1 ? 12 : spanMonths;
    const back = (year: number, month: number, day: number, toMonthEnd: boolean) => {
      const first = new Date(Date.UTC(year, month - 1 - months, 1));
      const y = first.getUTCFullYear();
      const m = first.getUTCMonth() + 1;
      const last = lastDayOfMonth(y, m);
      return dateKey(y, m, toMonthEnd ? last : Math.min(day, last));
    };
    return { from: back(fy, fm, 1, false), to: back(ty, tm, td, td === lastDayOfMonth(ty, tm)) };
  }
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  const prevTo = shiftDays(from, -1);
  return { from: shiftDays(prevTo, -(days - 1)), to: prevTo };
}

/**
 * Raporlar — seçilen dönemde tahsilat, kesilen fatura, satılan ve gönderilen
 * SMS. Önceden "Bu ay SMS kullanımı" satılan PAKET adedini gösteriyordu
 * (3 paket = "3"), gönderilen SMS (SmsDispatch) hiç okunmuyordu ve önceki ay
 * 0 iken büyüme "+0%" yazıyordu.
 *
 * Dönem `from`/`to` (YYYY-MM-DD, Türkiye takvimi, iki uç dahil) ile verilir —
 * ekran ortak dönem seçicisini kullanır. Eski `donem` anahtarları (bu-ay,
 * gecen-ay, son-12-ay) çalışmaya devam eder.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;
  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const fromKey = searchParams.get("from") || "";
  const toKey = searchParams.get("to") || "";
  let period: Period | "ozel";
  let current: { start: Date; end: Date };
  let previous: { start: Date; end: Date };
  if (fromKey || toKey) {
    if (!isValidDateKey(fromKey) || !isValidDateKey(toKey) || fromKey > toKey) {
      return NextResponse.json({ message: "Geçerli bir tarih aralığı seçin." }, { status: 400 });
    }
    const prev = previousKeys(fromKey, toKey);
    period = "ozel";
    current = { start: turkeyDayRangeUtc(fromKey).start, end: turkeyDayRangeUtc(toKey).end };
    previous = { start: turkeyDayRangeUtc(prev.from).start, end: turkeyDayRangeUtc(prev.to).end };
  } else {
    const raw = searchParams.get("donem");
    period = raw === "gecen-ay" || raw === "son-12-ay" ? raw : "bu-ay";
    ({ current, previous } = ranges(period));
  }
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
    previousRange: { start: previous.start.toISOString(), end: previous.end.toISOString() },
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
