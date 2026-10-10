// Muhasebe formlarında seçilen hastanın tahsilat bağlamı (borç, açık taksit
// planı, doktor önerisi). Hasta dosyası bu bilgiyi zaten elinde tuttuğu için
// kullanmaz. Kaynak sırası:
//  1. /api/patients/[id]/balance — tek kaynak bakiye (payments:read VEYA
//     finance:read; banko dahil). Borç, açık plan özeti ve tedavi doktorları.
//  2. Uç yanıt vermezse eski yollar: finance:read → /api/muhasebe/alacaklar;
//     yoksa açık taksit planı (installments:read) + son tahsilat (payments:read)
//     — bu yolda borç bilinmez (null), doktor önerisi planın doktorundan gelir.
import { toMoneyValue } from "@/lib/money-input";
import type { PaymentContext, PaymentPlanInfo } from "@/components/finance/PaymentForm";
import { isPositiveMoney, sumMoney } from "@/components/finance/finance-money";

export type PaymentContextPermissions = {
  canReadFinance: boolean;
  canReadInstallments: boolean;
  canReadPayments: boolean;
};

/** Plan özeti — Yeni taksit planı formu da kullanır. */
export type PatientDebtSummary = {
  /** Kalan borç (normalize); bilinmiyorsa null. */
  debt: string | null;
  /** Açık taksit planlarında kalan (normalize); bilinmiyorsa null. */
  planRemaining: string | null;
  context: PaymentContext;
};

type BalanceRow = AlacakRow & { patientId?: string };

type AlacakRow = {
  bakiye?: number | string | null;
  doctors?: { id: string; fullName: string }[];
  lastDoctorId?: string | null;
  plan?: { kalan?: number | string | null; nextDueDate?: string | null; nextDueAmount?: number | string | null; overdueCount?: number | null; doctorId?: string | null } | null;
};

type PlanItem = { id: string; siraNo?: number; vadeDate: string; kalan?: number | string | null; status: string };
export type PlanRow = { id: string; status: string; createdAt?: string; doctor?: { id: string; fullName: string } | null; taksitler?: PlanItem[] };

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function fromAlacak(row: AlacakRow, planKnown = true): PatientDebtSummary {
  const planKalan = toMoneyValue(row.plan?.kalan ?? null);
  const plan: PaymentPlanInfo | null = row.plan && isPositiveMoney(planKalan)
    ? {
        doctorId: row.plan.doctorId || null,
        doctorName: row.doctors?.find((doctor) => doctor.id === row.plan?.doctorId)?.fullName || null,
        nextDueAmount: toMoneyValue(row.plan.nextDueAmount ?? null),
        nextDueDate: row.plan.nextDueDate || null,
        overdueCount: Number(row.plan.overdueCount) || 0,
      }
    : null;
  const debt = toMoneyValue(row.bakiye ?? 0);
  return {
    debt,
    planRemaining: plan ? planKalan : planKnown ? "0.00" : null,
    context: {
      debt,
      plan,
      lastTreatmentDoctorId: row.lastDoctorId || null,
      treatingDoctorIds: (row.doctors || []).map((doctor) => doctor.id),
    },
  };
}

/** Açık planlardan (en yenisi) öneri bilgisi: sıradaki/geciken taksit ve planın doktoru. */
export function planInfoFromPlans(plans: readonly PlanRow[], today: string): { plan: PaymentPlanInfo | null; remaining: string } {
  const open = plans.filter((plan) => plan.status === "AKTIF" || plan.status === "DEVAM_EDIYOR");
  const openItems = (plan: PlanRow) => (plan.taksitler || [])
    .filter((item) => item.status !== "ODENDI" && item.status !== "IPTAL" && isPositiveMoney(item.kalan))
    .sort((a, b) => a.vadeDate.localeCompare(b.vadeDate));
  const remaining = sumMoney(open.flatMap((plan) => openItems(plan).map((item) => item.kalan ?? 0)));
  const latest = [...open].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).find((plan) => openItems(plan).length > 0);
  if (!latest) return { plan: null, remaining };
  const items = openItems(latest);
  const next = items[0];
  return {
    remaining,
    plan: {
      doctorId: latest.doctor?.id || null,
      doctorName: latest.doctor?.fullName || null,
      nextDueAmount: toMoneyValue(next.kalan ?? null),
      nextDueDate: next.vadeDate,
      overdueCount: items.filter((item) => item.status === "GECIKTI" || item.vadeDate.slice(0, 10) < today).length,
    },
  };
}

export async function loadPatientDebtSummary(patientId: string, permissions: PaymentContextPermissions, today: string): Promise<PatientDebtSummary | null> {
  const id = encodeURIComponent(patientId);
  if (permissions.canReadPayments || permissions.canReadFinance) {
    const balance = await getJson(`/api/patients/${id}/balance`) as BalanceRow | null;
    // "plan" anahtarı yalnız taksitleri görebilen role döner; yoksa planın kalanı bilinmez.
    if (balance && typeof balance === "object" && "bakiye" in balance) return fromAlacak(balance, "plan" in balance);
  }
  if (permissions.canReadFinance) {
    const data = await getJson(`/api/muhasebe/alacaklar?patientId=${id}`) as { rows?: AlacakRow[] } | null;
    const row = Array.isArray(data?.rows) ? data.rows[0] : null;
    return row ? fromAlacak(row) : null;
  }
  const [plansData, paymentsData] = await Promise.all([
    // stats=0: yalnız planlar gerekir; kurum geneli taksit istatistikleri hesaplanmasın.
    permissions.canReadInstallments ? getJson(`/api/taksit-plani?patientId=${id}&status=ACIK&take=10&stats=0`) : Promise.resolve(null),
    permissions.canReadPayments ? getJson(`/api/payments?patientId=${id}`) : Promise.resolve(null),
  ]);
  const plans = Array.isArray((plansData as { items?: unknown } | null)?.items) ? (plansData as { items: PlanRow[] }).items : [];
  const payments = Array.isArray(paymentsData) ? (paymentsData as { doctorId?: string | null; createdAt?: string }[]) : [];
  const { plan, remaining } = planInfoFromPlans(plans, today);
  const lastPayment = [...payments].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).find((payment) => payment.doctorId);
  return {
    debt: null,
    planRemaining: permissions.canReadInstallments ? remaining : null,
    context: { debt: null, plan, lastPaymentDoctorId: lastPayment?.doctorId || null },
  };
}

/**
 * Randevudan hekim önerisi (/api/appointments/patient-context; appointments:write
 * ister): sıradaki randevunun hekimi, yoksa son tamamlanan randevunun hekimi —
 * hasta dosyasının "tedavi yoksa randevunun hekimi" kuralıyla aynı sıra.
 * Ücrete yansıyan tedavisi olmayan hastada tahsilat formunun doktoru boş
 * gelmesin diye yalnız gerektiğinde çağrılır. Okunamazsa null.
 */
export async function loadAppointmentDoctorId(patientId: string): Promise<string | null> {
  const data = await getJson(`/api/appointments/patient-context?patientId=${encodeURIComponent(patientId)}`) as {
    nextAppointment?: { doctorId?: string | null } | null;
    lastAppointmentDoctorId?: string | null;
  } | null;
  return data?.nextAppointment?.doctorId || data?.lastAppointmentDoctorId || null;
}
