import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { summarizeInvoices } from "@/components/superadmin/invoice-status";
import { institutionState } from "@/components/superadmin/sa-labels";

export const dynamic = "force-dynamic";

const LOW_SMS_THRESHOLD = 50;
const DEMO_WARNING_DAYS = 7;

// Kontrol Paneli: "bugün neyle ilgilenmeliyim?" sorusunun cevabı. Fatura
// toplamları Faturalar ve klinik dosyasıyla AYNI fonksiyondan
// (summarizeInvoices) hesaplanır; iptal edilen fatura borca eklenmez.
export async function GET() {
  const auth = await requireAuth("superadmin");
  if (auth.error) return auth.error;

  if (auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Yetki yok" }, { status: 403 });
  }

  const now = new Date();
  const demoLimit = new Date(now.getTime() + DEMO_WARNING_DAYS * 86_400_000);

  const [
    institutions,
    invoices,
    wallet,
    openSupport,
    recentTransactions,
    latestLogs,
  ] = await Promise.all([
    prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        serviceMode: true,
        suspendedUntil: true,
        paymentGraceUntil: true,
        isDemo: true,
        demoExpiresAt: true,
        smsBalance: true,
        subscriptionPlan: true,
        billingCycle: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({ select: { status: true, amount: true, dueDate: true, paidAt: true } }),
    prisma.platformSmsWallet.findUnique({ where: { id: 1 } }),
    prisma.supportTicket.count({ where: { answer: null, status: { not: "CLOSED" } } }),
    prisma.smsTransaction.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { smsPackage: { select: { smsCount: true } }, institution: { select: { id: true, name: true } } },
    }),
    // Giriş/çıkış kayıtları operatöre iş çıkarmaz; akışta yalnız değişiklikler.
    prisma.auditLog.findMany({
      where: { action: { notIn: ["LOGIN", "LOGOUT"] } },
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        detail: true,
        createdAt: true,
        isGhost: true,
        actorRole: true,
        user: { select: { fullName: true, role: true, institution: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const iso = (value: Date | null) => (value ? value.toISOString() : null);
  const active = institutions.filter((item) => item.isActive);
  const blocked = active.filter((item) => institutionState({
    isActive: item.isActive,
    serviceMode: item.serviceMode,
    suspendedUntil: iso(item.suspendedUntil),
    paymentGraceUntil: iso(item.paymentGraceUntil),
    isDemo: item.isDemo,
    demoExpiresAt: iso(item.demoExpiresAt),
  }, now).blocked);
  const demoEndingSoon = active.filter((item) => item.isDemo && item.demoExpiresAt && item.demoExpiresAt >= now && item.demoExpiresAt <= demoLimit);
  const lowSms = active
    .filter((item) => item.smsBalance < LOW_SMS_THRESHOLD)
    .sort((a, b) => a.smsBalance - b.smsBalance);

  return NextResponse.json({
    totalInstitutions: institutions.length,
    activeInstitutions: active.length,
    blockedInstitutions: blocked.length,
    demoEndingSoon: demoEndingSoon.length,
    lowSmsThreshold: LOW_SMS_THRESHOLD,
    lowSmsCount: lowSms.length,
    lowSmsInstitutions: lowSms.slice(0, 5).map((item) => ({ id: item.id, name: item.name, smsBalance: item.smsBalance })),
    platformSmsStock: wallet?.availableBalance ?? 0,
    totalSmsBalance: institutions.reduce((sum, item) => sum + item.smsBalance, 0),
    invoices: summarizeInvoices(invoices, now),
    openSupport,
    recentInstitutions: institutions.slice(0, 5).map((item) => ({
      id: item.id,
      name: item.name,
      subscriptionPlan: item.subscriptionPlan,
      billingCycle: item.billingCycle,
      createdAt: item.createdAt.toISOString(),
    })),
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      institutionId: t.institution.id,
      institution: t.institution.name,
      smsCount: t.smsPackage.smsCount * t.quantity,
      amount: Number(t.totalPrice),
      createdAt: t.createdAt.toISOString(),
    })),
    latestLogs: latestLogs.map((log) => ({
      id: log.id,
      action: log.action,
      detail: log.detail,
      createdAt: log.createdAt.toISOString(),
      isGhost: log.isGhost,
      actorRole: log.actorRole,
      user: log.user ? { fullName: log.user.fullName, role: log.user.role, institution: log.user.institution } : null,
    })),
  });
}
