import type { BadgeTone } from "@/components/ui/Badge";

export type PlanStatus = "PLANLANDI" | "DEVAM_EDIYOR" | "TAMAMLANDI" | "IPTAL";
export type PlanStepStatus = "BEKLIYOR" | "YAPILDI" | "TAMAMLANDI" | "IPTAL";

export type PlanStep = {
  id: string;
  order: number;
  treatmentName: string;
  toothNo?: string | null;
  amount: number | string;
  status: PlanStepStatus;
  doneAt?: string | null;
  note?: string | null;
};

export type TreatmentPlan = {
  id: string;
  title: string;
  status: PlanStatus;
  totalCost?: number | string | null;
  notes?: string | null;
  createdAt: string;
  patient: { id: string; fullName: string; tcNo?: string | null; phone?: string | null };
  doctor: { id: string; fullName: string };
  steps: PlanStep[];
};

export type PlanListResponse = {
  items: TreatmentPlan[];
  total: number;
  page: number;
  pageCount: number;
  stats?: { total: number; byStatus: Record<PlanStatus, number> };
};

/** Hasta dosyasındaki plan listesiyle aynı ad ve renk (önceden iki ekran farklıydı). */
export const PLAN_STATUS: Record<PlanStatus, { label: string; tone: BadgeTone }> = {
  PLANLANDI: { label: "Planlandı", tone: "neutral" },
  DEVAM_EDIYOR: { label: "Devam ediyor", tone: "info" },
  TAMAMLANDI: { label: "Tamamlandı", tone: "success" },
  IPTAL: { label: "İptal edildi", tone: "neutral" },
};

export const STEP_STATUS: Record<PlanStepStatus, { label: string; tone: BadgeTone }> = {
  BEKLIYOR: { label: "Bekliyor", tone: "neutral" },
  YAPILDI: { label: "Yapıldı", tone: "success" },
  TAMAMLANDI: { label: "Yapıldı", tone: "success" },
  IPTAL: { label: "İptal edildi", tone: "neutral" },
};

export const isStepDone = (step: Pick<PlanStep, "status">) => step.status === "YAPILDI" || step.status === "TAMAMLANDI";
export const isStepPending = (step: Pick<PlanStep, "status">) => step.status === "BEKLIYOR";
export const isPlanOpen = (plan: Pick<TreatmentPlan, "status">) => plan.status === "PLANLANDI" || plan.status === "DEVAM_EDIYOR";

/**
 * Planın ilerlemesi ve tutarları — iptal edilen adımlar SAYILMAZ (ne toplama
 * ne de "x/y adım" paydasına girer). Önceden iptal edilen adım toplamda
 * kalıyor ve "1/3 adım %33" gibi yanlış ilerleme gösteriyordu. Tutarlar
 * kuruş (tam sayı) olarak toplanır; yuvarlama hatası olmaz.
 */
export function planProgress(plan: Pick<TreatmentPlan, "steps">) {
  const active = plan.steps.filter((step) => step.status !== "IPTAL");
  const done = active.filter(isStepDone);
  const toCents = (value: number | string) => Math.round(Number(value || 0) * 100);
  const totalCents = active.reduce((sum, step) => sum + toCents(step.amount), 0);
  const doneCents = done.reduce((sum, step) => sum + toCents(step.amount), 0);
  return {
    activeCount: active.length,
    doneCount: done.length,
    pendingCount: active.length - done.length,
    cancelledCount: plan.steps.length - active.length,
    total: totalCents / 100,
    done: doneCents / 100,
    remaining: (totalCents - doneCents) / 100,
  };
}

/** Boş bırakılan plan adı: ilk tedavilerin adları ("İmplant + Kron") ya da tarihli genel ad. */
export function autoPlanTitle(treatmentNames: string[], today: string) {
  const names = treatmentNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return `Tedavi planı – ${today}`;
  const head = names.slice(0, 3).join(" + ");
  const title = names.length > 3 ? `${head} + ${names.length - 3} tedavi` : head;
  return title.length > 200 ? `${title.slice(0, 197)}…` : title;
}

/** API hata gövdesinden okunabilir mesaj (bu uçlar { error } ya da { message } döner). */
export function apiMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "string" && record.error) return record.error;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
}
