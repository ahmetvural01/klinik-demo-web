// Tedavi planı uçlarının ortak kuralları: plan toplamı ve durum adları.
import { Prisma } from "@prisma/client";

/** Ekranda görünen durum adları — sunucu mesajlarında kod adı (PLANLANDI) görünmesin. */
export const PLAN_STATUS_LABEL: Record<string, string> = {
  PLANLANDI: "Planlandı",
  DEVAM_EDIYOR: "Devam ediyor",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal edildi",
};

type StepAmount = { amount: Prisma.Decimal | string | number | null; status: string };

/**
 * Plan toplamı: iptal edilen adımlar SAYILMAZ (plan §4 — iptal borç değildir).
 * Önceden toplam yalnız adım silindiğinde yeniden hesaplanıyor ve iptal edilen
 * adımın tutarı toplamda kalıyordu. Para hesabı Decimal ile yapılır.
 */
export function activeStepsTotal(steps: readonly StepAmount[]) {
  return steps.reduce(
    (sum, step) => (step.status === "IPTAL" ? sum : sum.plus(new Prisma.Decimal(step.amount ?? 0))),
    new Prisma.Decimal(0),
  );
}

/**
 * Yanıttaki planın `totalCost` alanını adımlardan yeniden hesaplar. Eski
 * kayıtlarda saklı toplam iptal edilmiş adımları içerebildiği için okuma
 * uçları da aynı kuralla döner (alan adı ve biçimi değişmez).
 */
export function withActiveTotal<T extends { steps?: readonly StepAmount[] | null; totalCost?: unknown }>(plan: T): T {
  if (!plan || !Array.isArray(plan.steps)) return plan;
  return { ...plan, totalCost: activeStepsTotal(plan.steps) };
}
