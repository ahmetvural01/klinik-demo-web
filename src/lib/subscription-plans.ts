// Süperadmin'in kurum düzenleme ve fatura oluşturma ekranlarında kullandığı
// tek fiyat kaynağı — pazarlama sayfasındaki (src/lib/site-content-default.ts
// DEFAULT_SITE_CONTENT.pricingCards) aylık fiyatlarla tutarlı tutulmalıdır.
// KURUMSAL paketin sabit fiyatı yoktur (özel teklif) — monthlyPrice null
// olduğunda süperadmin tutarı elle girer.

export type SubscriptionPlanId = "TEMEL" | "PROFESYONEL" | "KURUMSAL";
export type BillingCycleId = "AYLIK" | "YILLIK";

export type SubscriptionPlanInfo = {
  id: SubscriptionPlanId;
  label: string;
  monthlyPrice: number | null;
  features: string[];
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlanInfo> = {
  TEMEL: {
    id: "TEMEL",
    label: "Temel",
    monthlyPrice: 1990,
    features: ["Hasta ve randevu yönetimi", "Temel ödeme takibi", "Standart destek"],
  },
  PROFESYONEL: {
    id: "PROFESYONEL",
    label: "Profesyonel",
    monthlyPrice: 3490,
    features: ["Tüm Temel paket özellikleri", "SMS/e-posta otomasyonları", "Gelişmiş raporlar", "Öncelikli destek"],
  },
  KURUMSAL: {
    id: "KURUMSAL",
    label: "Kurumsal",
    monthlyPrice: null,
    features: ["Özel entegrasyonlar", "Özel SLA", "Sınırsız kullanıcı", "Öncelikli destek hattı"],
  },
};

// Yıllık ödemede ~%17 indirim (2 ay bedava mantığı) uygulanır — SaaS
// pazarında yaygın bir yıllık taahhüt indirimi.
const YEARLY_DISCOUNT = 0.83;

export function getPlanPrice(planId: SubscriptionPlanId, cycle: BillingCycleId): number | null {
  const plan = SUBSCRIPTION_PLANS[planId];
  if (plan.monthlyPrice === null) return null;
  if (cycle === "YILLIK") return Math.round(plan.monthlyPrice * 12 * YEARLY_DISCOUNT);
  return plan.monthlyPrice;
}
