/* eslint-disable no-console -- Fatura kesim hataları sunucu tanılaması için bilinçli olarak loglanır. */
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncInstitutionPaymentGate } from "@/lib/billing";
import { invalidateInstitutionCache } from "@/lib/api";
import { getPlanPrice, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";
import { turkeyDateKey, turkeyDayRangeUtc, turkeyMonthRangeUtc, turkeyYearMonth } from "@/lib/tz";

// Abonelik faturası her ayın 1'inde (sunucu o an uykudaysa ilk uyandığında)
// kendiliğinden kesilir; süperadmin her ay elle fatura kesmek zorunda kalmaz.
// Tutar = plan ücreti × aktif şube sayısı; vade kesimden 7 gün sonra.
// Ekim 2026 faturaları elle kesildi; otomatik kesim Kasım 2026'dan başlar.
const FIRST_AUTO_PERIOD = { year: 2026, month: 11 };
const DUE_DAYS = 7;

type YearMonth = { year: number; month: number };

function monthIndex(value: YearMonth) {
  return value.year * 12 + (value.month - 1);
}

function addMonths(value: YearMonth, count: number): YearMonth {
  const index = monthIndex(value) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function monthLabel(value: YearMonth) {
  return turkeyMonthRangeUtc(value.year, value.month).start.toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
}

export type SubscriptionInvoiceSweepResult = { checked: number; created: number; skipped: number; failed: number };

export async function runSubscriptionInvoiceSweep(now: Date = new Date()): Promise<SubscriptionInvoiceSweepResult> {
  const result: SubscriptionInvoiceSweepResult = { checked: 0, created: 0, skipped: 0, failed: 0 };
  const current = turkeyYearMonth(now);
  if (monthIndex(current) < monthIndex(FIRST_AUTO_PERIOD)) return result;

  const periodStart = turkeyMonthRangeUtc(current.year, current.month).start;
  // Ay içinde açılan kliniğin o ayı açılışta elle faturalanır; otomatik
  // kesim bir sonraki ayın 1'inde başlar. Demo ve kapalı kliniklere kesilmez.
  const institutions = await prisma.institution.findMany({
    where: { isActive: true, isDemo: false, createdAt: { lt: periodStart } },
    select: { id: true, subscriptionPlan: true, billingCycle: true },
  });
  if (institutions.length === 0) return result;

  const ids = institutions.map((item) => item.id);
  const [covered, branchCounts] = await Promise.all([
    prisma.invoice.findMany({
      where: { institutionId: { in: ids }, periodStart: { lte: periodStart }, periodEnd: { gt: periodStart } },
      select: { institutionId: true },
    }),
    prisma.clinicBranch.groupBy({
      by: ["institutionId"],
      where: { institutionId: { in: ids }, isActive: true },
      _count: { _all: true },
    }),
  ]);
  // İptal edilen (ör. hediye edilen ay) fatura da dönemi kapatır; yeniden kesilmez.
  const coveredIds = new Set(covered.map((item) => item.institutionId));
  const branchCountById = new Map(branchCounts.map((item) => [item.institutionId, item._count._all]));
  const dueDate = turkeyDayRangeUtc(turkeyDateKey(new Date(now.getTime() + DUE_DAYS * 86_400_000))).end;

  for (const institution of institutions) {
    if (coveredIds.has(institution.id)) continue;
    result.checked += 1;
    const price = getPlanPrice(institution.subscriptionPlan, institution.billingCycle);
    // Kurumsal planın sabit ücreti yok: teklif tutarıyla elle faturalanır.
    if (price === null || price <= 0) {
      result.skipped += 1;
      continue;
    }

    const yearly = institution.billingCycle === "YILLIK";
    const end = addMonths(current, yearly ? 12 : 1);
    const branches = Math.max(1, branchCountById.get(institution.id) ?? 1);
    const periodText = yearly ? `${monthLabel(current)} – ${monthLabel(addMonths(current, 11))}` : monthLabel(current);
    // Elle kesim penceresiyle aynı açıklama biçimi: mükerrer uyarısı ikisini de tanır.
    const description = `${SUBSCRIPTION_PLANS[institution.subscriptionPlan].label} — ${yearly ? "yıllık" : "aylık"} abonelik (${periodText}${branches > 1 ? `, ${branches} şube` : ""})`;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.invoice.create({
          data: {
            institutionId: institution.id,
            invoiceNo: `INV-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
            amount: new Prisma.Decimal(price).mul(branches),
            description,
            status: "PENDING",
            dueDate,
            periodStart,
            periodEnd: turkeyMonthRangeUtc(end.year, end.month).start,
          },
        });
        await syncInstitutionPaymentGate(institution.id, tx);
      });
      invalidateInstitutionCache(institution.id);
      result.created += 1;
    } catch (error) {
      // Aynı dönemi başka bir sunucu süreci kesmişse benzersiz indeks yakalar.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        result.skipped += 1;
        continue;
      }
      result.failed += 1;
      console.error(`[subscription-invoices] ${institution.id} için fatura kesilemedi:`, error);
    }
  }

  return result;
}
