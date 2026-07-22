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
  // Aktif doktor / toplam aktif kullanıcı üst sınırı — null = sınırsız.
  // Institution.maxActiveDoctors / maxActiveUsers bu değerlerden senkronlanır
  // (bkz. syncInstitutionPlanLimits, src/lib/subscription-plans.ts).
  maxDoctors: number | null;
  maxUsers: number | null;
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlanInfo> = {
  TEMEL: {
    id: "TEMEL",
    label: "Temel",
    monthlyPrice: 1990,
    maxDoctors: 2,
    maxUsers: 6,
    features: ["En fazla 2 doktor", "Hasta ve randevu yönetimi", "Temel ödeme takibi", "Standart destek"],
  },
  PROFESYONEL: {
    id: "PROFESYONEL",
    label: "Profesyonel",
    monthlyPrice: 3490,
    maxDoctors: 5,
    maxUsers: 15,
    features: ["En fazla 5 doktor", "Tüm Temel paket özellikleri", "SMS/e-posta otomasyonları", "Gelişmiş raporlar", "Öncelikli destek"],
  },
  KURUMSAL: {
    id: "KURUMSAL",
    label: "Kurumsal",
    monthlyPrice: null,
    maxDoctors: null,
    maxUsers: null,
    features: ["Sınırsız doktor ve kullanıcı", "Özel entegrasyonlar", "Özel SLA", "Öncelikli destek hattı"],
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

// Süperadmin bir kurumun planını değiştirdiğinde, o kurum için elle özel bir
// limit girilmemişse (maxActiveDoctors/maxActiveUsers body'de gönderilmemişse)
// yeni planın varsayılan limitlerine döner. Elle girilmiş bir özel limit varsa
// (body'de alan gönderildiyse) her zaman ona öncelik verilir — bu fonksiyon o
// durumda hiç çağrılmaz.
export function getPlanDefaultLimits(planId: SubscriptionPlanId): { maxActiveDoctors: number | null; maxActiveUsers: number | null } {
  const plan = SUBSCRIPTION_PLANS[planId];
  return { maxActiveDoctors: plan.maxDoctors, maxActiveUsers: plan.maxUsers };
}
