import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasEffectivePermission, requireAuth } from "@/lib/api";
import { getPlanPrice, SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

/**
 * Ayarlar › Abonelik: kliniğin planı, platform faturaları (abonelik ve SMS
 * paketi) ve nasıl ödeneceği. Ödenmemiş faturaların hepsi + kapanan son 12.
 */
export async function GET() {
  // Okuma izniyle açılır: ödeme gecikip kayıt kilitlendiğinde de yönetici
  // neyi ödeyeceğini görebilmeli (yazma izni kilitte 423 döner).
  const auth = await requireAuth("settings:read");
  if (auth.error) return auth.error;
  if (!(await hasEffectivePermission(auth.user, "settings:write"))) {
    return NextResponse.json({ message: "Abonelik bilgisini klinik yöneticisi görür" }, { status: 403 });
  }
  const institutionId = auth.user.institutionId;
  if (!institutionId) return NextResponse.json({ message: "Kurum bilgisi bulunamadı" }, { status: 403 });

  const [institution, branches, open, closed, config] = await Promise.all([
    prisma.institution.findUnique({ where: { id: institutionId }, select: { subscriptionPlan: true, billingCycle: true, isDemo: true } }),
    prisma.clinicBranch.count({ where: { institutionId, isActive: true } }),
    prisma.invoice.findMany({
      where: { institutionId, status: { in: ["PENDING", "OVERDUE"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, description: true, amount: true, status: true, dueDate: true, paidAt: true, createdAt: true },
    }),
    prisma.invoice.findMany({
      where: { institutionId, status: { in: ["PAID", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, description: true, amount: true, status: true, dueDate: true, paidAt: true, createdAt: true },
    }),
    prisma.platformBillingConfig.findUnique({ where: { id: 1 }, select: { paymentInstructions: true } }),
  ]);
  if (!institution) return NextResponse.json({ message: "Klinik bulunamadı" }, { status: 404 });

  const price = getPlanPrice(institution.subscriptionPlan, institution.billingCycle);
  const branchCount = Math.max(1, branches);
  const now = Date.now();
  const toRow = (invoice: (typeof open)[number]) => ({
    ...invoice,
    amount: Number(invoice.amount),
    // Vadesi geçen açık fatura "Gecikti" görünür (durum alanı her zaman güncellenmeyebilir).
    status: (invoice.status === "PENDING" || invoice.status === "OVERDUE") && invoice.dueDate && invoice.dueDate.getTime() < now ? "OVERDUE" : invoice.status,
  });

  return NextResponse.json({
    plan: {
      label: SUBSCRIPTION_PLANS[institution.subscriptionPlan].label,
      cycle: institution.billingCycle,
      price: price === null ? null : price * branchCount,
      unitPrice: price,
      branchCount,
      isDemo: institution.isDemo,
    },
    invoices: [...open.map(toRow), ...closed.map(toRow)],
    openTotal: open.reduce((sum, invoice) => sum + Number(invoice.amount), 0),
    paymentInstructions: config?.paymentInstructions?.trim() || "",
  });
}
