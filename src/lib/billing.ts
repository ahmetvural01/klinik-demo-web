import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

// Bir kurumun "kısıtlı mod" tetiği zaten src/lib/api.ts requireAuth() içinde
// var: paymentGraceUntil geçmişse VE ödenmemiş (PENDING/OVERDUE) bir fatura
// varsa yazma işlemleri kilitleniyor. Bu dosya o mekanizmayı BESLEYEN taraf —
// paymentGraceUntil'i fatura durumuna göre otomatik senkron tutar, böylece
// süperadmin elle "kısıtla" düğmesine basmak zorunda kalmaz: fatura vadesi
// geçince kurum kendiliğinden kısıtlanır, ödeme işaretlenince kendiliğinden
// açılır.

/**
 * Bir kurumun ödenmemiş faturalarına bakarak Institution.paymentGraceUntil
 * alanını günceller. En erken vadeli ödenmemiş faturanın tarihini kullanır —
 * o tarih geçtiğinde requireAuth() otomatik olarak yazma işlemlerini kilitler.
 * Ödenmemiş fatura yoksa kısıtlamayı tamamen kaldırır (null).
 */
// `client` verilmezse global `prisma` kullanılır; fatura durumu değişikliğiyle
// AYNI $transaction içinde çağrılacaksa (bkz. superadmin/invoices route'ları)
// oradaki `tx` geçirilmeli — aksi halde fatura DB'de güncellenip bu adım
// (ör. geçici DB hatasıyla) başarısız olursa "fatura PAID ama kurum hâlâ
// kısıtlı" gibi atomik olmayan bir tutarsızlık oluşabilirdi (bkz. denetim raporu).
export async function syncInstitutionPaymentGate(institutionId: string, client: DbClient = prisma) {
  const earliestUnpaid = await client.invoice.findFirst({
    where: { institutionId, status: { in: ["PENDING", "OVERDUE"] }, dueDate: { not: null } },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true },
  });

  await client.institution.update({
    where: { id: institutionId },
    data: { paymentGraceUntil: earliestUnpaid?.dueDate ?? null },
  });
}

export function computeNextDueDate(cycle: "AYLIK" | "YILLIK", from: Date = new Date()): Date {
  const next = new Date(from);
  if (cycle === "YILLIK") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export type BillingStatus = {
  nextDueDate: string | null;
  daysUntilDue: number | null;
  isRestricted: boolean;
  restrictedNote: string | null;
};

const APPROACHING_WARNING_DAYS = 7;

/**
 * Klinik tarafındaki (süperadmin olmayan) kullanıcılara gösterilecek
 * bilgilendirme/kısıtlama durumunu hesaplar — hem "yaklaşıyor" uyarısı hem
 * "kısıtlı" banner'ı için tek kaynak.
 */
export async function getBillingStatus(institutionId: string): Promise<BillingStatus> {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { paymentGraceUntil: true, serviceMode: true, serviceNote: true },
  });

  const earliestUnpaid = await prisma.invoice.findFirst({
    where: { institutionId, status: { in: ["PENDING", "OVERDUE"] }, dueDate: { not: null } },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true },
  });

  const now = new Date();
  const dueDate = earliestUnpaid?.dueDate ?? null;
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000) : null;

  const isRestricted = Boolean(
    (institution?.paymentGraceUntil && institution.paymentGraceUntil <= now) ||
    institution?.serviceMode === "SUSPENDED" ||
    institution?.serviceMode === "READ_ONLY"
  );

  return {
    nextDueDate: dueDate ? dueDate.toISOString() : null,
    daysUntilDue,
    isRestricted,
    restrictedNote: isRestricted ? (institution?.serviceNote || null) : null,
  };
}

export { APPROACHING_WARNING_DAYS };
